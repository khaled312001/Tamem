import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { ok } from '../../utils/response.js';

/**
 * Hard-coded promo catalogue. For now we have one launch code; new ones can
 * be added here without a schema migration. Each entry includes the validity
 * predicate against the caller's order history.
 */
type Promo = {
  code: string;
  titleAr: string;
  discountPercent: number;
  maxDiscountEgp?: number;
  // eligible(customerId, customerCompletedOrders) → true/reason
  eligible(opts: {
    customerId: string;
    completedOrders: number;
  }): { ok: true } | { ok: false; reason: string };
};

const PROMOS: Promo[] = [
  {
    code: 'TAMEM20',
    titleAr: 'خصم 20% على أول طلب',
    discountPercent: 20,
    maxDiscountEgp: 100,
    eligible: ({ completedOrders }) =>
      completedOrders === 0
        ? { ok: true }
        : { ok: false, reason: 'الكود صالح لأول طلب فقط — تم استخدامه من قبل' },
  },
];

const validateSchema = z.object({
  code: z.string().trim().min(2).max(40),
});

/**
 * POST /promos/validate — body { code }. Returns whether the calling customer
 * can use this code right now + the resulting discount details. Pure read,
 * no state change.
 */
export const validate: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const input = validateSchema.parse(req.body);
    const upper = input.code.toUpperCase();

    const promo = PROMOS.find((p) => p.code === upper);
    if (!promo) {
      return res.json({
        data: { valid: false, code: upper, reason: 'كود غير صحيح' },
      });
    }

    const completedOrders = await prisma.order.count({
      where: { customerId: req.user.id, status: { in: ['COMPLETED', 'DELIVERED'] } },
    });
    const elig = promo.eligible({ customerId: req.user.id, completedOrders });
    if (!elig.ok) {
      return res.json({
        data: { valid: false, code: promo.code, reason: elig.reason },
      });
    }

    ok(res, {
      valid: true,
      code: promo.code,
      titleAr: promo.titleAr,
      discountPercent: promo.discountPercent,
      maxDiscountEgp: promo.maxDiscountEgp ?? null,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Apply a promo code (if present in order.customData.promoCode) to a quoted
 * price. Returns the discounted price + the discount amount that was taken.
 * Idempotent and silent if no valid promo applies — admin always sees the raw
 * quote first, then this kicks in.
 */
export async function applyPromoToPrice(
  customerId: string,
  promoCode: string | undefined | null,
  rawPriceEgp: number,
): Promise<{ finalPriceEgp: number; discountEgp: number; promo: Promo | null }> {
  if (!promoCode) return { finalPriceEgp: rawPriceEgp, discountEgp: 0, promo: null };
  const promo = PROMOS.find((p) => p.code === promoCode.toUpperCase());
  if (!promo) return { finalPriceEgp: rawPriceEgp, discountEgp: 0, promo: null };

  const completedOrders = await prisma.order.count({
    where: { customerId, status: { in: ['COMPLETED', 'DELIVERED'] } },
  });
  // Allow the promo if the customer is still eligible (their CURRENT order
  // hasn't completed yet — we check completed history only).
  const elig = promo.eligible({ customerId, completedOrders });
  if (!elig.ok) return { finalPriceEgp: rawPriceEgp, discountEgp: 0, promo: null };

  let discount = (rawPriceEgp * promo.discountPercent) / 100;
  if (promo.maxDiscountEgp != null) discount = Math.min(discount, promo.maxDiscountEgp);
  discount = Math.round(discount);
  const final = Math.max(0, rawPriceEgp - discount);
  return { finalPriceEgp: final, discountEgp: discount, promo };
}
