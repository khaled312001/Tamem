import type { RequestHandler } from 'express';
import { z } from 'zod';

import { OrderStatus, UserRole } from '@tamem/types';

import { prisma } from '../../db/prisma.js';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { created } from '../../utils/response.js';

import { generateOrderNumber } from './orderNumber.js';

/**
 * POST /admin/orders — admin creates a manual phone-in order on behalf of a
 * customer. We accept either an existing customerId OR a phone number; in
 * the latter case we auto-find or auto-create the customer record so the
 * dispatcher doesn't have to leave the orders page.
 *
 * Keeps the API surface deliberately small (DELIVERY only for now — that's
 * 90% of phone-in orders). Admin can later edit price/status/driver as usual.
 */
const adminCreateSchema = z.object({
  customerId: z.string().optional(),
  customerPhone: z.string().optional(),
  customerName: z.string().trim().min(2).max(100).optional(),
  serviceId: z.string(),
  deliveryAddress: z.string().trim().min(2).max(500),
  deliveryLat: z.number().optional(),
  deliveryLng: z.number().optional(),
  notes: z.string().max(2000).optional(),
  quotedPrice: z.number().nonnegative().optional(),
  paymentMethod: z.enum(['CASH', 'VODAFONE_CASH', 'INSTAPAY']).default('CASH'),
});

export const adminCreateManualOrder: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    if (req.user.role !== UserRole.ADMIN) throw new ForbiddenError();
    const input = adminCreateSchema.parse(req.body);

    // ── Resolve customer ────────────────────────────────────────────────
    let customerId = input.customerId;
    if (!customerId && input.customerPhone) {
      const phone = input.customerPhone.trim();
      const existing = await prisma.user.findUnique({ where: { phone } });
      if (existing) {
        customerId = existing.id;
      } else {
        // Auto-create a customer with no password — they can use forgot-password
        // later if they want to log into the app.
        const fresh = await prisma.user.create({
          data: {
            phone,
            name: input.customerName ?? phone,
            role: UserRole.CUSTOMER,
            isPhoneVerified: false,
            isActive: true,
          },
        });
        customerId = fresh.id;
      }
    }
    if (!customerId) {
      throw new NotFoundError('Customer', 'لازم تحدد عميل');
    }

    const service = await prisma.service.findUnique({ where: { id: input.serviceId } });
    if (!service) throw new NotFoundError('Service', 'الخدمة غير موجودة');

    const orderNumber = generateOrderNumber();
    const order = await prisma.order.create({
      data: {
        orderNumber,
        serviceId: input.serviceId,
        customerId,
        category: service.category,
        status: input.quotedPrice ? OrderStatus.PRICED : OrderStatus.UNDER_REVIEW,
        merchantId: null,
        deliveryAddress: input.deliveryAddress,
        deliveryLat: input.deliveryLat,
        deliveryLng: input.deliveryLng,
        notes: input.notes,
        paymentMethod: input.paymentMethod,
        quotedPrice: input.quotedPrice,
        createdByAdminId: req.user.id,
      },
    });

    await prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        toStatus: order.status,
        changedById: req.user.id,
        changedByRole: UserRole.ADMIN,
        reason: 'طلب يدوي من لوحة التحكم',
      },
    });

    try {
      const { emitNewOrder } = await import('../../realtime/channels.js');
      emitNewOrder(req.app.locals.io, order);
    } catch {
      /* not critical */
    }

    // Dispatch the same NEW-status fan-out that customer-created orders get
    // so admin-typed orders also reach the customer over WhatsApp/SMS + push
    // + in-app. Without this, a phone-in order silently goes "missing" from
    // the customer's perspective until they happen to open the app.
    try {
      const { dispatchOrderStatusChanged } = await import('./orderEvents.js');
      await dispatchOrderStatusChanged(req.app, order, 'NEW');
    } catch (err) {
      logger.warn({ err, orderId: order.id }, 'manual order dispatch failed');
    }

    created(res, order);
  } catch (err) {
    next(err);
  }
};
