import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../utils/errors.js';
import { created, noContent, ok } from '../../utils/response.js';

const param = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new NotFoundError('Resource');
  return v;
};

const upsertSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(3)
    .max(40)
    .regex(/^[A-Z0-9_-]+$/, 'Letters, digits, _ and - only'),
  type: z.enum(['PERCENTAGE', 'FLAT']),
  value: z.number().positive(),
  minOrderAmount: z.number().nonnegative().optional(),
  maxDiscount: z.number().positive().optional(),
  validFrom: z.coerce.date().optional(),
  validTo: z.coerce.date().optional(),
  usageLimit: z.number().int().positive().optional(),
  usagePerUser: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
  description: z.string().max(500).optional(),
});

const validateSchema = z.object({
  code: z.string().trim().toUpperCase().min(1).max(40),
  orderAmount: z.number().nonnegative(),
});

/**
 * GET /coupons/available — list public, currently-valid coupons the
 * customer hasn't already maxed-out. Used by the customer Coupons screen so
 * users can discover promo codes without admin sharing them out-of-band.
 */
export const listAvailable: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const now = new Date();
    const rows = await prisma.coupon.findMany({
      where: {
        isActive: true,
        OR: [{ validFrom: null }, { validFrom: { lte: now } }],
        AND: [{ OR: [{ validTo: null }, { validTo: { gte: now } }] }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { redemptions: true } },
        redemptions: { where: { userId: req.user.id }, select: { id: true } },
      },
    });

    // Filter out coupons the customer has already used up.
    const usable = rows.filter((c) => {
      if (c.usageLimit && c._count.redemptions >= c.usageLimit) return false;
      const userUsage = c.redemptions.length;
      const perUserCap = c.usagePerUser ?? 1;
      return userUsage < perUserCap;
    });

    ok(
      res,
      usable.map((c) => ({
        id: c.id,
        code: c.code,
        type: c.type,
        value: Number(c.value),
        minOrderAmount: c.minOrderAmount ? Number(c.minOrderAmount) : null,
        maxDiscount: c.maxDiscount ? Number(c.maxDiscount) : null,
        validTo: c.validTo,
        description: c.description,
      })),
    );
  } catch (err) {
    next(err);
  }
};

// ────────────────────────────────────────────────────────────────────────────
// Admin CRUD
// ────────────────────────────────────────────────────────────────────────────

export const adminList: RequestHandler = async (_req, res, next) => {
  try {
    const coupons = await prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { redemptions: true } } },
    });
    ok(res, coupons);
  } catch (err) {
    next(err);
  }
};

export const adminCreate: RequestHandler = async (req, res, next) => {
  try {
    const input = upsertSchema.parse(req.body);
    if (input.type === 'PERCENTAGE' && input.value > 100) {
      throw new ValidationError(
        { value: ['percentage must be <= 100'] },
        'النسبة المئوية لا تتجاوز 100%',
      );
    }
    const exists = await prisma.coupon.findUnique({ where: { code: input.code } });
    if (exists) {
      throw new ConflictError('Coupon code exists', 'الكود مستخدم بالفعل');
    }
    const coupon = await prisma.coupon.create({ data: input });
    created(res, coupon);
  } catch (err) {
    next(err);
  }
};

export const adminUpdate: RequestHandler = async (req, res, next) => {
  try {
    const input = upsertSchema.partial().omit({ code: true }).parse(req.body);
    const coupon = await prisma.coupon.update({
      where: { id: param(req.params.id) },
      data: input,
    });
    ok(res, coupon);
  } catch (err) {
    next(err);
  }
};

export const adminDelete: RequestHandler = async (req, res, next) => {
  try {
    // Soft delete — flip isActive so historical redemptions stay queryable.
    await prisma.coupon.update({
      where: { id: param(req.params.id) },
      data: { isActive: false },
    });
    noContent(res);
  } catch (err) {
    next(err);
  }
};

// ────────────────────────────────────────────────────────────────────────────
// Customer-facing validation
// ────────────────────────────────────────────────────────────────────────────

/** Computes the discount the coupon would apply to a given order amount. */
function computeDiscount(
  coupon: {
    type: 'PERCENTAGE' | 'FLAT';
    value: { toString(): string };
    maxDiscount?: { toString(): string } | null;
  },
  orderAmount: number,
): number {
  const v = Number(coupon.value);
  let discount = coupon.type === 'PERCENTAGE' ? (orderAmount * v) / 100 : v;
  if (coupon.maxDiscount) {
    const cap = Number(coupon.maxDiscount);
    if (discount > cap) discount = cap;
  }
  // Never discount more than the order total
  if (discount > orderAmount) discount = orderAmount;
  return Math.round(discount * 100) / 100;
}

/**
 * POST /coupons/validate — customer types a code; we return whether it's
 * applicable and the computed discount. Doesn't reserve the redemption —
 * that happens when the order is actually created.
 */
export const validateCoupon: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const input = validateSchema.parse(req.body);
    const coupon = await prisma.coupon.findUnique({
      where: { code: input.code },
      include: {
        _count: { select: { redemptions: true } },
        redemptions: { where: { userId: req.user.id }, select: { id: true } },
      },
    });

    if (!coupon || !coupon.isActive) {
      ok(res, { valid: false, reason: 'الكود غير موجود أو غير نشط' });
      return;
    }
    const now = new Date();
    if (coupon.validFrom && coupon.validFrom > now) {
      ok(res, { valid: false, reason: 'الكود لم يبدأ بعد' });
      return;
    }
    if (coupon.validTo && coupon.validTo < now) {
      ok(res, { valid: false, reason: 'انتهت صلاحية الكود' });
      return;
    }
    if (coupon.usageLimit && coupon._count.redemptions >= coupon.usageLimit) {
      ok(res, { valid: false, reason: 'استُنفذ الكود' });
      return;
    }
    const userUsage = coupon.redemptions.length;
    const perUserCap = coupon.usagePerUser ?? 1;
    if (userUsage >= perUserCap) {
      ok(res, { valid: false, reason: 'استخدمت هذا الكود من قبل' });
      return;
    }
    if (coupon.minOrderAmount && input.orderAmount < Number(coupon.minOrderAmount)) {
      ok(res, {
        valid: false,
        reason: `الحد الأدنى للطلب ${coupon.minOrderAmount} ج.م`,
      });
      return;
    }

    const discount = computeDiscount(coupon, input.orderAmount);
    ok(res, {
      valid: true,
      discount,
      type: coupon.type,
      value: Number(coupon.value),
      finalAmount: Math.max(0, input.orderAmount - discount),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Helper for the order create flow. Returns the discount + coupon ref if the
 * code is valid for this user/amount, OR null. Throws ValidationError if the
 * code is invalid so the caller doesn't silently bypass it.
 */
export async function reserveCouponRedemption(
  code: string,
  userId: string,
  orderAmount: number,
): Promise<{ couponId: string; discount: number } | null> {
  if (!code) return null;
  const upper = code.trim().toUpperCase();
  const coupon = await prisma.coupon.findUnique({
    where: { code: upper },
    include: {
      _count: { select: { redemptions: true } },
      redemptions: { where: { userId }, select: { id: true } },
    },
  });
  if (!coupon || !coupon.isActive) {
    throw new ValidationError({ code: ['invalid'] }, 'الكود غير صالح');
  }
  const now = new Date();
  if (coupon.validFrom && coupon.validFrom > now) {
    throw new ValidationError({ code: ['not yet active'] }, 'الكود لم يبدأ');
  }
  if (coupon.validTo && coupon.validTo < now) {
    throw new ValidationError({ code: ['expired'] }, 'انتهت صلاحية الكود');
  }
  if (coupon.usageLimit && coupon._count.redemptions >= coupon.usageLimit) {
    throw new ValidationError({ code: ['exhausted'] }, 'استُنفذ الكود');
  }
  if (coupon.redemptions.length >= (coupon.usagePerUser ?? 1)) {
    throw new ValidationError({ code: ['per-user limit'] }, 'استخدمت الكود من قبل');
  }
  if (coupon.minOrderAmount && orderAmount < Number(coupon.minOrderAmount)) {
    throw new ValidationError({ code: ['min order'] }, `الحد الأدنى ${coupon.minOrderAmount} ج.م`);
  }
  const discount = computeDiscount(coupon, orderAmount);
  return { couponId: coupon.id, discount };
}
