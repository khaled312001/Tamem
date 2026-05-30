import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
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

const refundSchema = z.object({
  amount: z.number().positive(),
  reason: z.string().trim().min(2).max(500),
  /// If true, the equivalent amount is also credited to the customer's wallet
  /// so they can spend it on the next order. Defaults to false (cash refund).
  creditToWallet: z.boolean().optional(),
});

/**
 * PATCH /admin/payments/:id/refund — reverse a confirmed payment. The amount
 * can be partial; the order's paymentStatus rolls back to PENDING only if the
 * refund is the full amount.
 */
export const refund: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new NotFoundError('Admin');
    const paymentId = param(req.params.id);
    const input = refundSchema.parse(req.body);

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: { select: { id: true, customerId: true, paymentStatus: true } } },
    });
    if (!payment) throw new NotFoundError('Payment', 'الدفعة غير موجودة');
    if (payment.refundedAt) {
      throw new ValidationError({ payment: ['already refunded'] }, 'تم استرداد الدفعة من قبل');
    }
    const paidAmount = Number(payment.amount);
    if (input.amount > paidAmount) {
      throw new ValidationError(
        { amount: ['exceeds payment'] },
        'مبلغ الاسترداد أكبر من المبلغ المدفوع',
      );
    }

    const updated = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        refundedAt: new Date(),
        refundedById: req.user.id,
        refundAmount: input.amount,
        refundReason: input.reason,
        ...(input.amount === paidAmount ? { status: 'REFUNDED' } : {}),
      },
    });

    // Roll back the order's paymentStatus when fully refunded.
    if (input.amount === paidAmount) {
      await prisma.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: 'REFUNDED' },
      });
    }

    // Optional wallet credit so the customer can re-spend.
    if (input.creditToWallet) {
      try {
        const { adminAdjustWallet: _unused } = await import('../wallet/wallet.controller.js');
        void _unused;
        const wallet = await prisma.wallet.upsert({
          where: { userId: payment.order.customerId },
          create: { userId: payment.order.customerId },
          update: {},
        });
        const newBal = Number(wallet.balance) + input.amount;
        await prisma.$transaction([
          prisma.wallet.update({
            where: { id: wallet.id },
            data: { balance: newBal, totalEarned: { increment: input.amount } },
          }),
          prisma.walletTransaction.create({
            data: {
              walletId: wallet.id,
              type: 'REFUND',
              amount: input.amount,
              balanceAfter: newBal,
              orderId: payment.orderId,
              reason: `استرداد دفعة — ${input.reason}`,
              createdById: req.user.id,
            },
          }),
        ]);
      } catch {
        /* wallet credit failed — refund itself still succeeded */
      }
    }

    ok(res, updated);
  } catch (err) {
    next(err);
  }
};
