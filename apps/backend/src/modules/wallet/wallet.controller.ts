import type { Prisma } from '@prisma/client';
import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { NotFoundError, UnauthorizedError, ValidationError } from '../../utils/errors.js';
import { ok } from '../../utils/response.js';

/** Loyalty rule: customer earns 5% of finalPrice (rounded to nearest EGP) when
 *  an order reaches COMPLETED. Tunable later via Setting. */
const EARN_PCT = 0.05;

/** Ensure a wallet row exists for the user (lazily). Returns it. */
async function ensureWallet(userId: string) {
  const existing = await prisma.wallet.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.wallet.create({ data: { userId } });
}

/**
 * GET /me/wallet — returns the customer's balance + last 20 transactions.
 */
export const getMyWallet: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const wallet = await ensureWallet(req.user.id);
    const transactions = await prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    ok(res, { wallet, transactions });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /admin/wallets/:userId/credit — admin manually credits or debits a
 * user's wallet (e.g. compensation for a bad experience).
 */
export const adminAdjustWallet: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const userId = req.params.userId;
    if (typeof userId !== 'string') throw new NotFoundError('User');
    const input = z
      .object({
        amount: z.number().positive(),
        type: z.enum(['MANUAL_CREDIT', 'MANUAL_DEBIT']).default('MANUAL_CREDIT'),
        reason: z.string().trim().min(2).max(500),
      })
      .parse(req.body);

    const wallet = await ensureWallet(userId);
    const isCredit = input.type === 'MANUAL_CREDIT';
    const newBalance = isCredit
      ? Number(wallet.balance) + input.amount
      : Number(wallet.balance) - input.amount;
    if (newBalance < 0) {
      throw new ValidationError({ amount: ['would go negative'] }, 'الرصيد سيصبح سالباً');
    }
    const [updated, tx] = await prisma.$transaction([
      prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: newBalance,
          totalEarned: isCredit ? { increment: input.amount } : wallet.totalEarned,
          totalSpent: isCredit ? wallet.totalSpent : { increment: input.amount },
        },
      }),
      prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: input.type,
          amount: input.amount,
          balanceAfter: newBalance,
          reason: input.reason,
          createdById: req.user.id,
        },
      }),
    ]);
    ok(res, { wallet: updated, transaction: tx });
  } catch (err) {
    next(err);
  }
};

/**
 * Called by the order pipeline when an order transitions to COMPLETED.
 * Idempotent: checks for an existing EARN tx on this order before crediting.
 */
export async function creditLoyaltyForCompletedOrder(
  userId: string,
  orderId: string,
  finalPrice: number,
): Promise<void> {
  if (!finalPrice || finalPrice <= 0) return;
  const wallet = await ensureWallet(userId);
  const already = await prisma.walletTransaction.findFirst({
    where: { walletId: wallet.id, type: 'EARN', orderId },
  });
  if (already) return;
  const reward = Math.round(finalPrice * EARN_PCT);
  if (reward <= 0) return;
  const newBalance = Number(wallet.balance) + reward;
  await prisma.$transaction([
    prisma.wallet.update({
      where: { id: wallet.id },
      data: {
        balance: newBalance,
        totalEarned: { increment: reward },
      },
    }),
    prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'EARN',
        amount: reward,
        balanceAfter: newBalance,
        orderId,
        reason: `مكافأة ولاء ${Math.round(EARN_PCT * 100)}% على طلب مكتمل`,
      },
    }),
  ]);
}

/**
 * Helper for the order create flow. Debits the wallet by the requested amount
 * (capped at the current balance) and returns the actual amount used + new
 * balance. Must be called inside a transaction so the read+write is atomic.
 */
export async function debitWalletForOrder(
  tx: Prisma.TransactionClient,
  userId: string,
  requestedAmount: number,
  orderId: string,
): Promise<number> {
  if (requestedAmount <= 0) return 0;
  const wallet = await tx.wallet.findUnique({ where: { userId } });
  if (!wallet) return 0;
  const used = Math.min(Number(wallet.balance), requestedAmount);
  if (used <= 0) return 0;
  const newBalance = Number(wallet.balance) - used;
  await tx.wallet.update({
    where: { id: wallet.id },
    data: { balance: newBalance, totalSpent: { increment: used } },
  });
  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: 'SPEND',
      amount: used,
      balanceAfter: newBalance,
      orderId,
      reason: 'خصم من المحفظة على طلب',
    },
  });
  return used;
}
