import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { NotFoundError } from '../../utils/errors.js';
import { ok, paginated } from '../../utils/response.js';

const param = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new NotFoundError('Resource');
  return v;
};

const listQuerySchema = z.object({
  status: z.enum(['PENDING', 'PAID', 'FAILED', 'REFUNDED']).optional(),
  method: z.enum(['CASH', 'VODAFONE_CASH', 'INSTAPAY']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

const rejectSchema = z.object({
  reason: z.string().trim().min(2).max(500),
});

export const list: RequestHandler = async (req, res, next) => {
  try {
    const q = listQuerySchema.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.status) where.status = q.status;
    if (q.method) where.method = q.method;
    if (q.from || q.to) {
      where.createdAt = {
        ...(q.from ? { gte: q.from } : {}),
        ...(q.to ? { lte: q.to } : {}),
      };
    }
    const [items, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              customerId: true,
              customer: { select: { name: true, phone: true } },
            },
          },
        },
      }),
      prisma.payment.count({ where }),
    ]);
    paginated(res, items, { page: q.page, pageSize: q.pageSize, total });
  } catch (err) {
    next(err);
  }
};

export const confirm: RequestHandler = async (req, res, next) => {
  try {
    const paymentId = param(req.params.id);
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundError('Payment', 'الدفعة غير موجودة');

    const updated = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'PAID',
        confirmedById: req.user!.id,
        confirmedAt: new Date(),
      },
    });

    // Mark order as PAID too
    await prisma.order.update({
      where: { id: payment.orderId },
      data: { paymentStatus: 'PAID' },
    });
    ok(res, updated);
  } catch (err) {
    next(err);
  }
};

export const reject: RequestHandler = async (req, res, next) => {
  try {
    const paymentId = param(req.params.id);
    const input = rejectSchema.parse(req.body);
    const updated = await prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'FAILED', notes: input.reason },
    });
    ok(res, updated);
  } catch (err) {
    next(err);
  }
};
