import type { RequestHandler } from 'express';
import { z } from 'zod';

import { OrderStatus, UserRole } from '@tamem/types';
import { cancelOrderSchema, createOrderSchema, pricingEstimateSchema } from '@tamem/validators';

import { prisma } from '../../db/prisma.js';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../utils/errors.js';
import { created, ok, paginated } from '../../utils/response.js';

import { generateOrderNumber } from './orderNumber.js';
import { assertTransition } from './transitions.js';

const param = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new NotFoundError('Resource');
  return v;
};

const listMineQuery = z.object({
  status: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
});

export const createOrder: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const input = createOrderSchema.parse(req.body);

    const service = await prisma.service.findUnique({ where: { id: input.serviceId } });
    if (!service || !service.isActive) throw new NotFoundError('Service', 'الخدمة غير متاحة');

    const orderNumber = generateOrderNumber();
    const common = {
      orderNumber,
      serviceId: input.serviceId,
      customerId: req.user.id,
      category: input.category,
      status: OrderStatus.NEW,
      paymentMethod: input.paymentMethod,
      notes: input.notes,
      customData: (input.customData ?? undefined) as object | undefined,
    };

    let order;
    if (input.category === 'DELIVERY') {
      order = await prisma.order.create({
        data: {
          ...common,
          merchantId: input.merchantId,
          deliveryAddress: input.deliveryAddress,
          deliveryLat: input.deliveryLat,
          deliveryLng: input.deliveryLng,
          imageUrls: input.imageUrls,
        },
      });
    } else if (input.category === 'SHIPPING') {
      order = await prisma.order.create({
        data: {
          ...common,
          pickupAddress: input.pickupAddress,
          pickupLat: input.pickupLat,
          pickupLng: input.pickupLng,
          deliveryAddress: input.deliveryAddress,
          deliveryLat: input.deliveryLat,
          deliveryLng: input.deliveryLng,
          weightKg: input.weightKg,
          sizeCategory: input.sizeCategory,
          isFragile: input.isFragile,
          speedTier: input.speedTier,
        },
      });
    } else {
      // MERCHANT — multi-pickup + multi-delivery + items
      order = await prisma.order.create({
        data: {
          ...common,
          pickupPoints: {
            create: input.pickupPoints.map((p, i) => ({
              sortOrder: i,
              merchantId: p.merchantId,
              label: p.label,
              address: p.address,
              lat: p.lat,
              lng: p.lng,
              contactName: p.contactName,
              contactPhone: p.contactPhone,
              notes: p.notes,
            })),
          },
          deliveryPoints: {
            create: input.deliveryPoints.map((d, i) => ({
              sortOrder: i,
              recipientName: d.recipientName,
              recipientPhone: d.recipientPhone,
              address: d.address,
              lat: d.lat,
              lng: d.lng,
              notes: d.notes,
            })),
          },
          items: {
            create: input.items.map((it) => ({
              productId: it.productId,
              productNameSnapshot: it.productNameSnapshot,
              quantity: it.quantity,
              merchantId: it.merchantId,
              notes: it.notes,
            })),
          },
        },
      });
    }

    await prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        toStatus: OrderStatus.NEW,
        changedById: req.user.id,
        changedByRole: UserRole.CUSTOMER,
      },
    });

    // Realtime broadcast
    try {
      const { emitNewOrder } = await import('../../realtime/channels.js');
      emitNewOrder(req.app.locals.io, order);
    } catch {
      // realtime not critical
    }

    created(res, order);
  } catch (err) {
    next(err);
  }
};

export const listMine: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const q = listMineQuery.parse(req.query);
    const where: Record<string, unknown> = { customerId: req.user.id };
    if (q.status) where.status = q.status as OrderStatus;

    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          service: { select: { id: true, nameAr: true, category: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);
    paginated(res, items, { page: q.page, pageSize: q.pageSize, total });
  } catch (err) {
    next(err);
  }
};

export const getMine: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const order = await prisma.order.findUnique({
      where: { id: param(req.params.id) },
      include: {
        service: true,
        items: true,
        pickupPoints: { orderBy: { sortOrder: 'asc' } },
        deliveryPoints: { orderBy: { sortOrder: 'asc' } },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        assignedDriver: { select: { id: true, name: true, phone: true } },
      },
    });
    if (!order) throw new NotFoundError('Order', 'الطلب غير موجود');
    if (order.customerId !== req.user.id && req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenError('لا تستطيع عرض هذا الطلب');
    }
    ok(res, order);
  } catch (err) {
    next(err);
  }
};

export const approveOrder: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const order = await prisma.order.findUnique({ where: { id: param(req.params.id) } });
    if (!order) throw new NotFoundError('Order', 'الطلب غير موجود');
    if (order.customerId !== req.user.id) throw new ForbiddenError();

    assertTransition(order.status, OrderStatus.ACCEPTED, req.user.role);
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.ACCEPTED, customerApprovedAt: new Date() },
    });
    await prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: OrderStatus.ACCEPTED,
        changedById: req.user.id,
        changedByRole: UserRole.CUSTOMER,
        reason: 'Customer approved quoted price',
      },
    });
    ok(res, updated);
  } catch (err) {
    next(err);
  }
};

export const cancelMine: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const input = cancelOrderSchema.parse(req.body);
    const order = await prisma.order.findUnique({ where: { id: param(req.params.id) } });
    if (!order) throw new NotFoundError('Order', 'الطلب غير موجود');
    if (order.customerId !== req.user.id) throw new ForbiddenError();

    assertTransition(order.status, OrderStatus.CANCELLED, req.user.role);
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: input.reason,
      },
    });
    await prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: OrderStatus.CANCELLED,
        changedById: req.user.id,
        changedByRole: UserRole.CUSTOMER,
        reason: input.reason,
      },
    });
    ok(res, updated);
  } catch (err) {
    next(err);
  }
};

export const estimatePrice: RequestHandler = async (req, res, next) => {
  try {
    const input = pricingEstimateSchema.parse(req.body);
    const service = await prisma.service.findUnique({ where: { id: input.serviceId } });
    if (!service) throw new NotFoundError('Service', 'الخدمة غير موجودة');
    if (service.pricingMethod === 'QUOTE') {
      ok(res, { estimate: null, method: 'QUOTE', note: 'سيتم تسعيره يدوياً من الإدارة' });
      return;
    }

    const base = Number(service.basePrice ?? 0);
    const perKm = Number(service.pricePerKm ?? 0);
    const perKg = Number(service.pricePerKg ?? 0);

    let distance = 0;
    if (
      input.pickupLat !== undefined &&
      input.pickupLng !== undefined &&
      input.deliveryLat !== undefined &&
      input.deliveryLng !== undefined
    ) {
      distance = haversineKm(
        input.pickupLat,
        input.pickupLng,
        input.deliveryLat,
        input.deliveryLng,
      );
    }

    let estimate = base;
    if (service.pricingMethod === 'DISTANCE' || service.pricingMethod === 'DISTANCE_WEIGHT') {
      estimate += distance * perKm;
    }
    if (service.pricingMethod === 'WEIGHT' || service.pricingMethod === 'DISTANCE_WEIGHT') {
      estimate += (input.weightKg ?? 0) * perKg;
    }
    if (input.isFragile) estimate += 10;
    if (input.speedTier === 'EXPRESS') estimate *= 1.25;

    estimate = Math.round(estimate);
    ok(res, {
      estimate,
      method: service.pricingMethod,
      breakdown: { base, distance, perKm, perKg },
    });
  } catch (err) {
    next(err);
  }
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// reference to keep unused import warning quiet
void ValidationError;
