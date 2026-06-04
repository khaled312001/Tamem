/**
 * HomeConfig — admin-editable content for the mobile home screen.
 *
 * Singleton: one row, id='singleton'. We auto-create on first read so the
 * mobile gets sensible defaults even before any admin has touched the page.
 *
 * Two public surfaces:
 *   GET /home-config           — what the mobile app reads
 *   GET /admin/home-config     — same payload, admin auth (mostly for audit)
 *   PATCH /admin/home-config   — admin edit
 */
import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { ok } from '../../utils/response.js';

const ID = 'singleton';

const patchSchema = z.object({
  heroGreeting: z.string().max(120).nullable().optional(),
  heroSubtitle: z.string().max(160).nullable().optional(),
  heroGradient: z
    .array(z.string().regex(/^#?[0-9a-fA-F]{3,8}$/))
    .min(2)
    .max(4)
    .nullable()
    .optional(),
  trustStripTitle: z.string().max(120).nullable().optional(),
  trustStripSubtitle: z.string().max(160).nullable().optional(),
  promoBannerCouponId: z.string().max(30).nullable().optional(),
  promoBannerTitle: z.string().max(140).nullable().optional(),
  promoBannerCode: z.string().max(40).nullable().optional(),
  visibleServiceKeys: z.array(z.string()).nullable().optional(),
  featuredMerchantIds: z.array(z.string()).nullable().optional(),
  featuredOfferIds: z.array(z.string()).nullable().optional(),
  showPromoBanner: z.boolean().optional(),
  showTrustStrip: z.boolean().optional(),
});

/**
 * Ensure the singleton row exists. Returns the current state.
 */
async function loadConfig() {
  return prisma.homeConfig.upsert({
    where: { id: ID },
    update: {},
    create: { id: ID },
  });
}

/** Public — mobile app reads this on home screen mount.
 *
 * If the admin selected a coupon for the promo banner, we inline the coupon
 * details (code/value/description) so the mobile can render the banner in
 * one round-trip without a second query. Inactive/expired coupons silently
 * fall back to the free-text fields. */
export const getPublicConfig: RequestHandler = async (_req, res, next) => {
  try {
    const cfg = await loadConfig();
    let promoCoupon: {
      id: string;
      code: string;
      type: string;
      value: string;
      description: string | null;
    } | null = null;
    if (cfg.promoBannerCouponId) {
      const coupon = await prisma.coupon.findUnique({
        where: { id: cfg.promoBannerCouponId },
        select: {
          id: true,
          code: true,
          type: true,
          value: true,
          description: true,
          isActive: true,
          validTo: true,
        },
      });
      const stillValid =
        coupon && coupon.isActive && (!coupon.validTo || coupon.validTo.getTime() >= Date.now());
      if (stillValid) {
        promoCoupon = {
          id: coupon!.id,
          code: coupon!.code,
          type: coupon!.type,
          value: String(coupon!.value),
          description: coupon!.description,
        };
      }
    }
    ok(res, { ...cfg, promoCoupon });
  } catch (err) {
    next(err);
  }
};

/** Admin GET — same payload, just behind auth. */
export const getAdminConfig: RequestHandler = async (_req, res, next) => {
  try {
    const cfg = await loadConfig();
    ok(res, cfg);
  } catch (err) {
    next(err);
  }
};

/** Admin PATCH — update any subset of the fields. */
export const patchAdminConfig: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const input = patchSchema.parse(req.body);
    // Make sure the row exists before we patch (first-ever PATCH).
    await loadConfig();
    const updated = await prisma.homeConfig.update({
      where: { id: ID },
      data: {
        ...input,
        // JSON fields need to be passed as `Prisma.JsonValue` — cast to never
        // because zod typed them as plain arrays/strings.
        heroGradient: (input.heroGradient ?? undefined) as never,
        visibleServiceKeys: (input.visibleServiceKeys ?? undefined) as never,
        featuredMerchantIds: (input.featuredMerchantIds ?? undefined) as never,
        featuredOfferIds: (input.featuredOfferIds ?? undefined) as never,
        updatedById: req.user.id,
      },
    });
    ok(res, updated);
  } catch (err) {
    next(err);
  }
};
