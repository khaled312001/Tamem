/**
 * GET /me/export — GDPR-style data export.
 *
 * Returns every piece of personally-identifiable data we hold about the
 * caller, in a single JSON document the mobile app can hand to the user
 * (or that the user can request via support). Includes:
 *
 *   - Profile fields (no password hashes, no internal IDs we don't surface
 *     elsewhere).
 *   - Saved addresses.
 *   - Orders the user placed (with line items + pickup/delivery points).
 *   - Payments associated with those orders.
 *   - Wallet + transactions.
 *   - Coupon redemptions.
 *   - Reviews the user wrote.
 *   - In-app notifications.
 *
 * Audit log lookups and refresh tokens are deliberately excluded — they
 * are operational data, not personal data the user authored.
 *
 * The response is streamed as a single JSON body via Express; for very
 * heavy accounts the dashboard can offer a paginated browser-side export
 * instead. For Phase 1 a single JSON is sufficient.
 */
import type { RequestHandler } from 'express';

import { prisma } from '../../db/prisma.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { ok } from '../../utils/response.js';

export const exportMyData: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const userId = req.user.id;

    const [user, addresses, orders, wallet, redemptions, reviews, notifications] =
      await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            phone: true,
            name: true,
            email: true,
            avatarUrl: true,
            role: true,
            isPhoneVerified: true,
            city: true,
            governorate: true,
            defaultAddress: true,
            createdAt: true,
          },
        }),
        prisma.customerAddress.findMany({ where: { userId } }),
        prisma.order.findMany({
          where: { customerId: userId },
          orderBy: { createdAt: 'desc' },
          include: {
            items: true,
            pickupPoints: true,
            deliveryPoints: true,
            payments: {
              select: {
                id: true,
                amount: true,
                method: true,
                status: true,
                referenceNumber: true,
                confirmedAt: true,
                createdAt: true,
                refundedAt: true,
                refundAmount: true,
                refundReason: true,
              },
            },
          },
        }),
        prisma.wallet.findUnique({
          where: { userId },
          include: {
            transactions: { orderBy: { createdAt: 'desc' } },
          },
        }),
        prisma.couponRedemption.findMany({
          where: { userId },
          include: { coupon: { select: { code: true, type: true, value: true } } },
        }),
        prisma.orderReview.findMany({ where: { customerId: userId } }),
        prisma.notification.findMany({
          where: { userId },
          orderBy: { sentAt: 'desc' },
          take: 500, // hard cap to keep export size bounded
        }),
      ]);

    ok(res, {
      meta: {
        exportedAt: new Date().toISOString(),
        format: 'tamem-export/v1',
      },
      profile: user,
      addresses,
      orders,
      payments: orders.flatMap((o) => o.payments),
      wallet: wallet ?? null,
      couponRedemptions: redemptions,
      reviews,
      notifications,
    });
  } catch (err) {
    next(err);
  }
};
