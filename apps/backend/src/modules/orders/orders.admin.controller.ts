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
});

const updateStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
  reason: z.string().max(500).optional(),
});

const internalNoteSchema = z.object({
  note: z.string().trim().min(1).max(2000),
});

export const adminList: RequestHandler = async (req, res, next) => {
  try {
    const q = listQuerySchema.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.status) where.status = q.status as OrderStatus;
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
        orderBy: { createdAt: 'desc' },
        include: {
          service: { select: { id: true, name: true, nameAr: true, category: true } },
          customer: { select: { id: true, name: true, phone: true } },
          assignedDriver: { select: { id: true, name: true, phone: true } },
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

    // Pricing usually moves the order from UNDER_REVIEW -> PRICED.
    // Allow setting/updating the price without changing status if it's already PRICED.
    if (order.status === OrderStatus.UNDER_REVIEW) {
      assertTransition(order.status, OrderStatus.PRICED, req.user!.role);
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        quotedPrice: input.quotedPrice,
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
          reason: input.note ?? `Priced at ${input.quotedPrice}`,
          metadata: { quotedPrice: input.quotedPrice },
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
