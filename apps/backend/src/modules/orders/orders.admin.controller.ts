import type { RequestHandler } from 'express';
import { z } from 'zod';

import { OrderStatus, UserRole } from '@tamem/types';
import { assignDriverSchema, cancelOrderSchema, setPriceSchema } from '@tamem/validators';

import { prisma } from '../../db/prisma.js';
import { ConflictError, NotFoundError } from '../../utils/errors.js';
import { ok, paginated } from '../../utils/response.js';

import { dispatchOrderStatusChanged } from './orderEvents.js';
import { assertTransition } from './transitions.js';

const param = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new NotFoundError('Resource');
  return v;
};

// Whitelist sortable columns — never echo user input into a Prisma orderBy
// dictionary or we'd open ourselves to passing garbage that breaks the query.
const SORTABLE = ['createdAt', 'orderNumber', 'status', 'finalPrice', 'quotedPrice'] as const;

const listQuerySchema = z.object({
  status: z.string().optional(),
  category: z.enum(['DELIVERY', 'SHIPPING', 'MERCHANT']).optional(),
  customerId: z.string().optional(),
  driverId: z.string().optional(),
  search: z.string().optional(),
  serviceId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(SORTABLE).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

const updateStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
  reason: z.string().max(500).optional(),
});

const internalNoteSchema = z.object({
  note: z.string().trim().min(1).max(2000),
});

const bulkStatusSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  status: z.nativeEnum(OrderStatus),
  reason: z.string().max(500).optional(),
});

export const adminList: RequestHandler = async (req, res, next) => {
  try {
    const q = listQuerySchema.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.status) {
      // Accept either a single status or a comma-separated list (used by tabs that
      // group multiple statuses, e.g. "PRICED,AWAITING_CUSTOMER_APPROVAL").
      const list = q.status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      where.status = list.length === 1 ? (list[0] as OrderStatus) : { in: list as OrderStatus[] };
    }
    if (q.category) where.category = q.category;
    if (q.customerId) where.customerId = q.customerId;
    if (q.driverId) where.assignedDriverId = q.driverId;
    if (q.serviceId) where.serviceId = q.serviceId;
    if (q.from || q.to) {
      where.createdAt = {
        ...(q.from ? { gte: q.from } : {}),
        ...(q.to ? { lte: q.to } : {}),
      };
    }
    if (q.search) {
      where.OR = [
        { orderNumber: { contains: q.search } },
        { customer: { name: { contains: q.search } } },
        { customer: { phone: { contains: q.search } } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        // Always tie-break by createdAt desc so sorts on nullable columns
        // (finalPrice on un-priced orders) stay stable across pages.
        orderBy: [
          { [q.sortBy]: q.sortDir },
          ...(q.sortBy === 'createdAt' ? [] : [{ createdAt: 'desc' as const }]),
        ],
        include: {
          service: { select: { id: true, name: true, nameAr: true, category: true } },
          customer: { select: { id: true, name: true, phone: true } },
          assignedDriver: {
            select: {
              id: true,
              name: true,
              phone: true,
              driverProfile: {
                select: {
                  currentLat: true,
                  currentLng: true,
                  lastLocationAt: true,
                  vehicleType: true,
                  vehiclePlate: true,
                },
              },
            },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);
    paginated(res, items, { page: q.page, pageSize: q.pageSize, total });
  } catch (err) {
    next(err);
  }
};

export const adminGet: RequestHandler = async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: param(req.params.id) },
      include: {
        service: true,
        customer: { select: { id: true, name: true, phone: true, city: true } },
        assignedDriver: {
          select: {
            id: true,
            name: true,
            phone: true,
            driverProfile: {
              select: {
                vehicleType: true,
                vehiclePlate: true,
                status: true,
                rating: true,
              },
            },
          },
        },
        items: true,
        pickupPoints: { orderBy: { sortOrder: 'asc' } },
        deliveryPoints: { orderBy: { sortOrder: 'asc' } },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          include: { changedBy: { select: { id: true, name: true, role: true } } },
        },
        payments: true,
        alerts: { where: { isResolved: false } },
      },
    });
    if (!order) throw new NotFoundError('Order', 'الطلب غير موجود');
    ok(res, order);
  } catch (err) {
    next(err);
  }
};

export const adminUpdateStatus: RequestHandler = async (req, res, next) => {
  try {
    const input = updateStatusSchema.parse(req.body);
    const order = await prisma.order.findUnique({ where: { id: param(req.params.id) } });
    if (!order) throw new NotFoundError('Order', 'الطلب غير موجود');

    assertTransition(order.status, input.status, req.user!.role);

    // Business-rule guards on top of the role/state-machine check. The state
    // machine alone says "PRICED → DRIVER_ASSIGNED is reachable", but it
    // doesn't know we must have a driver row to assign — that's tracked
    // separately on the Order. Catch it here so the admin gets a clear
    // 422 ("اختر سائق أولاً") instead of a corrupt half-assigned order.
    const needsPrice: OrderStatus[] = [
      OrderStatus.PRICED,
      OrderStatus.AWAITING_CUSTOMER_APPROVAL,
      OrderStatus.ACCEPTED,
      OrderStatus.DRIVER_ASSIGNED,
      OrderStatus.PICKED_UP,
      OrderStatus.IN_ROUTE,
      OrderStatus.DELIVERED,
      OrderStatus.COMPLETED,
    ];
    if (
      needsPrice.includes(input.status) &&
      order.quotedPrice == null &&
      order.finalPrice == null
    ) {
      throw new ConflictError('NEEDS_PRICE', 'لازم تسعّر الطلب أولاً قبل ما تنقل لهذه المرحلة');
    }

    const needsDriver: OrderStatus[] = [
      OrderStatus.DRIVER_ASSIGNED,
      OrderStatus.PICKED_UP,
      OrderStatus.IN_ROUTE,
      OrderStatus.DELIVERED,
    ];
    if (needsDriver.includes(input.status) && !order.assignedDriverId) {
      throw new ConflictError(
        'NEEDS_DRIVER',
        'لازم تعيّن سائق للطلب أولاً قبل ما تنقل لهذه المرحلة',
      );
    }

    const lifecycleStamps: Record<string, Date> = {};
    if (input.status === OrderStatus.PICKED_UP) lifecycleStamps.pickedUpAt = new Date();
    if (input.status === OrderStatus.DELIVERED) lifecycleStamps.deliveredAt = new Date();
    if (input.status === OrderStatus.COMPLETED) lifecycleStamps.completedAt = new Date();
    if (input.status === OrderStatus.CANCELLED) {
      lifecycleStamps.cancelledAt = new Date();
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: input.status,
        ...lifecycleStamps,
        ...(input.status === OrderStatus.CANCELLED && input.reason
          ? { cancellationReason: input.reason }
          : {}),
      },
    });

    await prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: input.status,
        changedById: req.user!.id,
        changedByRole: UserRole.ADMIN,
        reason: input.reason,
      },
    });

    await dispatchOrderStatusChanged(req.app, updated, updated.status);
    ok(res, updated);
  } catch (err) {
    next(err);
  }
};

export const adminSetPrice: RequestHandler = async (req, res, next) => {
  try {
    const input = setPriceSchema.parse(req.body);
    const order = await prisma.order.findUnique({ where: { id: param(req.params.id) } });
    if (!order) throw new NotFoundError('Order', 'الطلب غير موجود');

    if (order.status === OrderStatus.UNDER_REVIEW) {
      assertTransition(order.status, OrderStatus.PRICED, req.user!.role);
    }

    // If the customer attached a promo code (in customData.promoCode), apply
    // the discount automatically before storing the quoted price so the
    // customer sees the discounted number — and the admin doesn't have to
    // remember to subtract it manually.
    const customData = (order.customData ?? {}) as Record<string, unknown>;
    const promoCode = typeof customData.promoCode === 'string' ? customData.promoCode : undefined;
    const { applyPromoToPrice } = await import('../promos/promos.controller.js');
    const promoResult = await applyPromoToPrice(order.customerId, promoCode, input.quotedPrice);

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        quotedPrice: promoResult.finalPriceEgp,
        ...(promoResult.discountEgp > 0
          ? {
              customData: {
                ...customData,
                promoApplied: {
                  code: promoResult.promo?.code,
                  rawPrice: input.quotedPrice,
                  discount: promoResult.discountEgp,
                  appliedAt: new Date().toISOString(),
                },
              },
            }
          : {}),
        ...(order.status === OrderStatus.UNDER_REVIEW ? { status: OrderStatus.PRICED } : {}),
      },
    });

    if (order.status === OrderStatus.UNDER_REVIEW) {
      await prisma.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: OrderStatus.PRICED,
          changedById: req.user!.id,
          changedByRole: UserRole.ADMIN,
          reason:
            input.note ??
            (promoResult.discountEgp > 0
              ? `Priced at ${input.quotedPrice} − ${promoResult.discountEgp} (${promoResult.promo?.code}) = ${promoResult.finalPriceEgp}`
              : `Priced at ${input.quotedPrice}`),
          metadata: {
            quotedPrice: promoResult.finalPriceEgp,
            ...(promoResult.discountEgp > 0
              ? {
                  rawPrice: input.quotedPrice,
                  discount: promoResult.discountEgp,
                  promoCode: promoResult.promo?.code,
                }
              : {}),
          },
        },
      });
      await dispatchOrderStatusChanged(req.app, updated, OrderStatus.PRICED);
    }
    ok(res, updated);
  } catch (err) {
    next(err);
  }
};

export const adminAssignDriver: RequestHandler = async (req, res, next) => {
  try {
    const input = assignDriverSchema.parse(req.body);
    const order = await prisma.order.findUnique({ where: { id: param(req.params.id) } });
    if (!order) throw new NotFoundError('Order', 'الطلب غير موجود');

    const driver = await prisma.user.findFirst({
      where: { id: input.driverId, role: 'DRIVER' },
      include: { driverProfile: true },
    });
    if (!driver) throw new NotFoundError('Driver', 'السائق غير موجود');
    if (driver.driverProfile?.status === 'OFFLINE') {
      throw new ConflictError('Driver offline', 'السائق غير متصل');
    }

    if (order.status === OrderStatus.ACCEPTED) {
      assertTransition(order.status, OrderStatus.DRIVER_ASSIGNED, req.user!.role);
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        assignedDriverId: driver.id,
        ...(order.status === OrderStatus.ACCEPTED ? { status: OrderStatus.DRIVER_ASSIGNED } : {}),
      },
    });

    if (order.status === OrderStatus.ACCEPTED) {
      await prisma.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: OrderStatus.DRIVER_ASSIGNED,
          changedById: req.user!.id,
          changedByRole: UserRole.ADMIN,
          reason: `Assigned driver ${driver.name}`,
          metadata: { driverId: driver.id },
        },
      });
      await dispatchOrderStatusChanged(req.app, updated, OrderStatus.DRIVER_ASSIGNED);
    }
    ok(res, updated);
  } catch (err) {
    next(err);
  }
};

export const adminAddNote: RequestHandler = async (req, res, next) => {
  try {
    const input = internalNoteSchema.parse(req.body);
    const order = await prisma.order.findUnique({ where: { id: param(req.params.id) } });
    if (!order) throw new NotFoundError('Order', 'الطلب غير موجود');

    // We record notes as status-history entries with the same fromStatus==toStatus
    // so they appear inline on the timeline.
    const entry = await prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: order.status,
        changedById: req.user!.id,
        changedByRole: UserRole.ADMIN,
        reason: input.note,
        metadata: { kind: 'NOTE' },
      },
    });
    ok(res, entry);
  } catch (err) {
    next(err);
  }
};

export const adminCancel: RequestHandler = async (req, res, next) => {
  try {
    const input = cancelOrderSchema.parse(req.body);
    const order = await prisma.order.findUnique({ where: { id: param(req.params.id) } });
    if (!order) throw new NotFoundError('Order', 'الطلب غير موجود');

    assertTransition(order.status, OrderStatus.CANCELLED, req.user!.role);

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
        changedById: req.user!.id,
        changedByRole: UserRole.ADMIN,
        reason: input.reason,
      },
    });
    await dispatchOrderStatusChanged(req.app, updated, updated.status);
    ok(res, updated);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /admin/orders/bulk-status — flip many orders to a target status in one
 * round-trip. Each order is validated individually with assertTransition so the
 * FSM is still enforced. Invalid transitions are reported back but do not
 * abort the batch — partial success is fine.
 */
export const adminBulkStatus: RequestHandler = async (req, res, next) => {
  try {
    const input = bulkStatusSchema.parse(req.body);
    const orders = await prisma.order.findMany({ where: { id: { in: input.ids } } });

    const succeeded: string[] = [];
    const failed: { id: string; reason: string }[] = [];

    for (const order of orders) {
      try {
        assertTransition(order.status, input.status, req.user!.role);
      } catch (err) {
        failed.push({
          id: order.id,
          reason: err instanceof Error ? err.message : 'invalid transition',
        });
        continue;
      }

      const lifecycleStamps: Record<string, Date> = {};
      if (input.status === OrderStatus.PICKED_UP) lifecycleStamps.pickedUpAt = new Date();
      if (input.status === OrderStatus.DELIVERED) lifecycleStamps.deliveredAt = new Date();
      if (input.status === OrderStatus.COMPLETED) lifecycleStamps.completedAt = new Date();
      if (input.status === OrderStatus.CANCELLED) lifecycleStamps.cancelledAt = new Date();

      const updated = await prisma.order.update({
        where: { id: order.id },
        data: {
          status: input.status,
          ...lifecycleStamps,
          ...(input.status === OrderStatus.CANCELLED && input.reason
            ? { cancellationReason: input.reason }
            : {}),
        },
      });

      await prisma.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: input.status,
          changedById: req.user!.id,
          changedByRole: UserRole.ADMIN,
          reason: input.reason ?? 'bulk update',
        },
      });

      await dispatchOrderStatusChanged(req.app, updated, input.status);
      succeeded.push(order.id);
    }

    // Report ids that weren't in the DB at all (caller passed stale ids).
    const foundIds = new Set(orders.map((o) => o.id));
    for (const id of input.ids) {
      if (!foundIds.has(id)) failed.push({ id, reason: 'not found' });
    }

    ok(res, { succeeded, failed });
  } catch (err) {
    next(err);
  }
};
