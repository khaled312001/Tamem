/**
 * Recurring orders — customer "deliver this every X" subscriptions.
 *
 * The customer creates a RecurringOrder template (service, address, payment,
 * frequency). A cron (see ./recurring.cron.ts) runs hourly and, for every
 * active row whose nextRunAt is past, inserts a fresh Order using the
 * template + bumps nextRunAt by frequency.
 *
 * Customers can list / pause / resume / delete their own recurring orders
 * from the mobile app; nobody else can see or touch them.
 */
import type { RequestHandler } from 'express';
import { z } from 'zod';

import { OrderStatus } from '@tamem/types';

// Prisma generates the RecurringFrequency enum from schema.prisma. We pull
// the type from the generated client so we don't have to mirror the enum
// in shared-types just for one module.
type RecurringFrequency = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

import { prisma } from '../../db/prisma.js';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../utils/errors.js';
import { created, ok } from '../../utils/response.js';
import { generateOrderNumber } from '../orders/orderNumber.js';

const param = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new NotFoundError('Resource');
  return v;
};

// ── Schemas ─────────────────────────────────────────────────────────────────

const createSchema = z.object({
  serviceId: z.string().min(1),
  category: z.enum(['DELIVERY', 'SHIPPING', 'MERCHANT']),
  label: z.string().max(120).optional(),
  merchantId: z.string().optional(),
  notes: z.string().max(2000).optional(),
  customData: z.record(z.unknown()).optional(),
  imageUrls: z.array(z.string().url()).optional(),
  paymentMethod: z.enum(['CASH', 'VODAFONE_CASH', 'INSTAPAY']).optional(),
  deliveryAddress: z.string().max(500).optional(),
  deliveryLat: z.number().min(-90).max(90).optional(),
  deliveryLng: z.number().min(-180).max(180).optional(),
  frequency: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']),
  /// Required for WEEKLY/BIWEEKLY: 0=Sunday..6=Saturday
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  /// Required for MONTHLY: 1..28 (we cap at 28 to avoid Feb-30 edge cases)
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  /// Local hour 0..23 — the order is created at this hour in the customer's day.
  hour: z.number().int().min(0).max(23).default(10),
  endsAt: z.coerce.date().optional(),
});

const updateSchema = createSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ── Schedule math ───────────────────────────────────────────────────────────

/**
 * Compute the next run timestamp for a recurring template, given the
 * frequency knobs and a base date. We use UTC math but anchor on `hour`
 * as a local hour-of-day; the customer's clock will see the order pop in
 * around that local time even after DST shifts.
 */
function computeNextRunAt(
  input: {
    frequency: RecurringFrequency;
    dayOfWeek?: number | null;
    dayOfMonth?: number | null;
    hour: number;
  },
  base: Date = new Date(),
): Date {
  const next = new Date(base);
  next.setMinutes(0, 0, 0);
  next.setHours(input.hour);

  // If the chosen hour today is still in the future, today is the start
  // candidate; otherwise advance to the next viable day.
  if (next.getTime() <= base.getTime()) {
    next.setDate(next.getDate() + 1);
  }

  switch (input.frequency) {
    case 'DAILY':
      return next;
    case 'WEEKLY':
    case 'BIWEEKLY': {
      const target = input.dayOfWeek ?? 0;
      // Advance until we land on the desired weekday.
      while (next.getDay() !== target) {
        next.setDate(next.getDate() + 1);
      }
      return next;
    }
    case 'MONTHLY': {
      const target = input.dayOfMonth ?? 1;
      next.setDate(target);
      if (next.getTime() <= base.getTime()) {
        next.setMonth(next.getMonth() + 1);
        next.setDate(target);
      }
      return next;
    }
  }
}

/** Bump nextRunAt by one frequency period — called after we generated an order. */
export function bumpNextRunAt(template: {
  frequency: RecurringFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  hour: number;
  nextRunAt: Date;
}): Date {
  const base = new Date(template.nextRunAt);
  switch (template.frequency) {
    case 'DAILY':
      base.setDate(base.getDate() + 1);
      return base;
    case 'WEEKLY':
      base.setDate(base.getDate() + 7);
      return base;
    case 'BIWEEKLY':
      base.setDate(base.getDate() + 14);
      return base;
    case 'MONTHLY':
      base.setMonth(base.getMonth() + 1);
      return base;
  }
}

// ── Endpoints ───────────────────────────────────────────────────────────────

/** GET /me/recurring-orders — list mine. */
export const listMine: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const rows = await prisma.recurringOrder.findMany({
      where: { customerId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: { service: { select: { id: true, nameAr: true, key: true, category: true } } },
    });
    ok(res, rows);
  } catch (err) {
    next(err);
  }
};

/** POST /me/recurring-orders — create one. */
export const createOne: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const input = createSchema.parse(req.body);

    // Validate frequency-specific fields.
    if (
      (input.frequency === 'WEEKLY' || input.frequency === 'BIWEEKLY') &&
      input.dayOfWeek == null
    ) {
      throw new ValidationError({ dayOfWeek: 'مطلوب لتكرار أسبوعي / كل أسبوعين' });
    }
    if (input.frequency === 'MONTHLY' && input.dayOfMonth == null) {
      throw new ValidationError({ dayOfMonth: 'مطلوب للتكرار الشهري' });
    }

    const service = await prisma.service.findUnique({ where: { id: input.serviceId } });
    if (!service || !service.isActive) {
      throw new NotFoundError('Service', 'الخدمة غير متاحة');
    }

    const nextRunAt = computeNextRunAt(input);

    const row = await prisma.recurringOrder.create({
      data: {
        customerId: req.user.id,
        serviceId: input.serviceId,
        category: input.category,
        label: input.label,
        merchantId: input.merchantId,
        notes: input.notes,
        customData: (input.customData ?? undefined) as object | undefined,
        imageUrls: (input.imageUrls ?? undefined) as object | undefined,
        paymentMethod: input.paymentMethod,
        deliveryAddress: input.deliveryAddress,
        deliveryLat: input.deliveryLat,
        deliveryLng: input.deliveryLng,
        frequency: input.frequency,
        dayOfWeek: input.dayOfWeek,
        dayOfMonth: input.dayOfMonth,
        hour: input.hour,
        endsAt: input.endsAt,
        nextRunAt,
      },
    });
    created(res, row);
  } catch (err) {
    next(err);
  }
};

/** PATCH /me/recurring-orders/:id — update (most commonly toggle isActive). */
export const updateOne: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const id = param(req.params.id);
    const input = updateSchema.parse(req.body);

    const existing = await prisma.recurringOrder.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('RecurringOrder');
    if (existing.customerId !== req.user.id) throw new ForbiddenError();

    // If frequency / dayOfWeek / dayOfMonth / hour changed, recompute next run.
    const cadenceChanged =
      input.frequency !== undefined ||
      input.dayOfWeek !== undefined ||
      input.dayOfMonth !== undefined ||
      input.hour !== undefined;

    let nextRunAt = existing.nextRunAt;
    if (cadenceChanged) {
      nextRunAt = computeNextRunAt({
        frequency: input.frequency ?? existing.frequency,
        dayOfWeek: input.dayOfWeek ?? existing.dayOfWeek,
        dayOfMonth: input.dayOfMonth ?? existing.dayOfMonth,
        hour: input.hour ?? existing.hour,
      });
    }

    const row = await prisma.recurringOrder.update({
      where: { id },
      data: {
        ...input,
        customData: (input.customData ?? undefined) as object | undefined,
        imageUrls: (input.imageUrls ?? undefined) as object | undefined,
        nextRunAt,
      },
    });
    ok(res, row);
  } catch (err) {
    next(err);
  }
};

/** DELETE /me/recurring-orders/:id */
export const deleteOne: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const id = param(req.params.id);
    const existing = await prisma.recurringOrder.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('RecurringOrder');
    if (existing.customerId !== req.user.id) throw new ForbiddenError();
    await prisma.recurringOrder.delete({ where: { id } });
    ok(res, { deleted: true });
  } catch (err) {
    next(err);
  }
};

// ── Cron worker ─────────────────────────────────────────────────────────────

/**
 * Generate any pending recurring orders. Called by the recurring.cron module.
 * Idempotent within a single pass — if it crashes mid-loop, the next run
 * picks up where we left off because `nextRunAt` is only bumped after the
 * Order insert succeeds.
 *
 * Returns the number of orders created in this pass.
 */
export async function runRecurringOrdersPass(now: Date = new Date()): Promise<number> {
  const due = await prisma.recurringOrder.findMany({
    where: {
      isActive: true,
      nextRunAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
    },
    take: 100,
  });

  let count = 0;
  for (const t of due) {
    try {
      await prisma.$transaction(async (tx) => {
        // Build the order from the template.
        const orderNumber = generateOrderNumber();
        await tx.order.create({
          data: {
            orderNumber,
            serviceId: t.serviceId,
            customerId: t.customerId,
            category: t.category,
            status: OrderStatus.NEW,
            merchantId: t.merchantId ?? undefined,
            notes: t.notes ?? undefined,
            customData: (t.customData ?? undefined) as object | undefined,
            imageUrls: (t.imageUrls ?? undefined) as object | undefined,
            paymentMethod: t.paymentMethod ?? undefined,
            deliveryAddress: t.deliveryAddress ?? undefined,
            deliveryLat: t.deliveryLat ?? undefined,
            deliveryLng: t.deliveryLng ?? undefined,
          },
        });

        await tx.recurringOrder.update({
          where: { id: t.id },
          data: {
            lastGeneratedAt: now,
            nextRunAt: bumpNextRunAt(t),
          },
        });
      });
      count++;
    } catch {
      // Skip on row failure; next pass retries. We don't unbump nextRunAt
      // on error so a stuck template doesn't lock the whole pass.
    }
  }
  return count;
}
