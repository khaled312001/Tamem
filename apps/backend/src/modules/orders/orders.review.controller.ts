import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { sendPushToUser } from '../../integrations/fcm.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { created, ok } from '../../utils/response.js';

import { notify } from '../notifications/notifications.controller.js';

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  driverRating: z.number().int().min(1).max(5).optional(),
  merchantRating: z.number().int().min(1).max(5).optional(),
  comment: z.string().trim().max(1000).optional(),
});

const param = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new NotFoundError('Resource');
  return v;
};

/**
 * Recomputes a user's running average rating from all reviews where they were
 * the driver or merchant. Called inline after each new review so we never
 * serve a stale rating on driver/merchant cards.
 */
async function recomputeDriverRating(driverId: string): Promise<void> {
  const agg = await prisma.orderReview.aggregate({
    where: { driverId, driverRating: { not: null } },
    _avg: { driverRating: true },
    _count: { driverRating: true },
  });
  const avg = agg._avg.driverRating;
  if (avg !== null) {
    await prisma.driverProfile.update({
      where: { userId: driverId },
      data: { rating: avg },
    });
  }
}

async function recomputeMerchantRating(merchantId: string): Promise<void> {
  const agg = await prisma.orderReview.aggregate({
    where: { merchantId, merchantRating: { not: null } },
    _avg: { merchantRating: true },
  });
  const avg = agg._avg.merchantRating;
  if (avg !== null) {
    await prisma.merchantProfile.update({
      where: { id: merchantId },
      data: { rating: avg },
    });
  }
}

/**
 * POST /orders/:id/review — customer rates a completed/delivered order.
 * One review per order; can't be edited after creation (audit log integrity).
 */
export const createOrderReview: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const orderId = param(req.params.id);
    const input = reviewSchema.parse(req.body);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { review: true },
    });
    if (!order) throw new NotFoundError('Order', 'الطلب غير موجود');
    if (order.customerId !== req.user.id) throw new ForbiddenError();
    if (!['DELIVERED', 'COMPLETED'].includes(order.status)) {
      throw new ValidationError(
        { status: ['must be DELIVERED or COMPLETED'] },
        'لا يمكن تقييم الطلب قبل تسليمه',
      );
    }
    if (order.review) {
      throw new ConflictError('Already reviewed', 'تم تقييم هذا الطلب من قبل');
    }

    const review = await prisma.orderReview.create({
      data: {
        orderId,
        customerId: req.user.id,
        driverId: order.assignedDriverId,
        merchantId: order.merchantId,
        rating: input.rating,
        driverRating: input.driverRating ?? null,
        merchantRating: input.merchantRating ?? null,
        comment: input.comment ?? null,
      },
    });

    // Update running averages (in parallel; never block the response on failure).
    void Promise.all([
      order.assignedDriverId && input.driverRating
        ? recomputeDriverRating(order.assignedDriverId)
        : null,
      order.merchantId && input.merchantRating ? recomputeMerchantRating(order.merchantId) : null,
    ]).catch(() => {
      /* don't care — averages are best-effort, the review is the source of truth */
    });

    // Notify the rated parties so the review reaches the driver / merchant
    // in real time, not just as a silent number on their average. Notifies
    // are fire-and-forget — a failure mustn't block the review save.
    void (async () => {
      try {
        const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
        const trimmed = input.comment?.trim();

        if (order.assignedDriverId && input.driverRating) {
          const titleAr = `تقييم جديد للطلب ${order.orderNumber}`;
          const bodyAr = `${stars(input.driverRating)} (${input.driverRating}/5)${
            trimmed ? ` — "${trimmed}"` : ''
          }`;
          await notify(order.assignedDriverId, 'SYSTEM', titleAr, bodyAr, {
            data: { orderId, reviewId: review.id, kind: 'driver_review' },
          });
          await sendPushToUser(order.assignedDriverId, {
            title: titleAr,
            body: bodyAr,
            data: { orderId, reviewId: review.id, kind: 'driver_review' },
          }).catch(() => undefined);
        }

        if (order.merchantId && input.merchantRating) {
          // Merchant ratings go to the merchant's owner user account.
          const merchant = await prisma.merchantProfile.findUnique({
            where: { id: order.merchantId },
            select: { userId: true },
          });
          if (merchant?.userId) {
            const titleAr = `تقييم جديد للطلب ${order.orderNumber}`;
            const bodyAr = `${stars(input.merchantRating)} (${input.merchantRating}/5)${
              trimmed ? ` — "${trimmed}"` : ''
            }`;
            await notify(merchant.userId, 'SYSTEM', titleAr, bodyAr, {
              data: { orderId, reviewId: review.id, kind: 'merchant_review' },
            });
            await sendPushToUser(merchant.userId, {
              title: titleAr,
              body: bodyAr,
              data: { orderId, reviewId: review.id, kind: 'merchant_review' },
            }).catch(() => undefined);
          }
        }
      } catch (err) {
        logger.warn({ err, reviewId: review.id }, 'review notification dispatch failed');
      }
    })();

    created(res, review);
  } catch (err) {
    next(err);
  }
};

/** GET /orders/:id/review — the review on this order if any (owner or admin). */
export const getOrderReview: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const orderId = param(req.params.id);
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { customerId: true, review: true },
    });
    if (!order) throw new NotFoundError('Order', 'الطلب غير موجود');
    if (order.customerId !== req.user.id && req.user.role !== 'ADMIN') {
      throw new ForbiddenError();
    }
    ok(res, order.review ?? null);
  } catch (err) {
    next(err);
  }
};

/** GET /admin/reviews — paginated list of all reviews with optional driver/merchant filter. */
export const adminListReviews: RequestHandler = async (req, res, next) => {
  try {
    const q = z
      .object({
        driverId: z.string().optional(),
        merchantId: z.string().optional(),
        minRating: z.coerce.number().int().min(1).max(5).optional(),
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(100).default(20),
      })
      .parse(req.query);

    const where: Record<string, unknown> = {};
    if (q.driverId) where.driverId = q.driverId;
    if (q.merchantId) where.merchantId = q.merchantId;
    if (q.minRating) where.rating = { gte: q.minRating };

    const [items, total] = await Promise.all([
      prisma.orderReview.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          order: { select: { id: true, orderNumber: true } },
        },
      }),
      prisma.orderReview.count({ where }),
    ]);
    res.json({
      data: items,
      meta: {
        pagination: {
          page: q.page,
          pageSize: q.pageSize,
          total,
          totalPages: Math.ceil(total / q.pageSize),
        },
      },
    });
  } catch (err) {
    next(err);
  }
};
