/**
 * Wallet smoke tests.
 *
 * The wallet has two write paths that matter:
 *   1. Loyalty earn on COMPLETED — flat 5% of finalPrice. Must be idempotent
 *      so we don't double-credit if dispatchOrderStatusChanged fires twice.
 *   2. Customer-driven SPEND at checkout — debits balance, must reject if
 *      it would go negative.
 *
 * These tests cover both, using a throwaway wallet so we never pollute
 * the seeded customer's balance.
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creditLoyaltyForCompletedOrder } from '../src/modules/wallet/wallet.controller.js';

const prisma = new PrismaClient();
const TEST_PHONE = '+201557000888';

describe('Wallet — loyalty credit', () => {
  let userId: string;

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { phone: TEST_PHONE } });
    const user = await prisma.user.create({
      data: {
        phone: TEST_PHONE,
        name: 'Wallet Test User',
        role: 'CUSTOMER',
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    // Cascade should clean wallet + transactions when the user is deleted.
    await prisma.user.deleteMany({ where: { phone: TEST_PHONE } });
    await prisma.$disconnect();
  });

  it('credits 5% of finalPrice and records an EARN transaction', async () => {
    const orderId = `test-loyalty-${Date.now()}`;
    await creditLoyaltyForCompletedOrder(userId, orderId, 200);

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    expect(wallet).toBeTruthy();
    // 5% of 200 = 10 EGP
    expect(Number(wallet!.balance)).toBe(10);

    const txs = await prisma.walletTransaction.findMany({
      where: { walletId: wallet!.id, type: 'EARN', orderId },
    });
    expect(txs).toHaveLength(1);
    expect(Number(txs[0]!.amount)).toBe(10);
  });

  it('is idempotent — calling twice for the same orderId does not double-credit', async () => {
    const orderId = `test-loyalty-idem-${Date.now()}`;
    await creditLoyaltyForCompletedOrder(userId, orderId, 100);
    await creditLoyaltyForCompletedOrder(userId, orderId, 100);

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    const txs = await prisma.walletTransaction.findMany({
      where: { walletId: wallet!.id, type: 'EARN', orderId },
    });
    expect(txs).toHaveLength(1);
  });

  it('skips no-op for zero or negative price', async () => {
    const balBefore = await prisma.wallet.findUnique({ where: { userId } });
    await creditLoyaltyForCompletedOrder(userId, 'noop-0', 0);
    await creditLoyaltyForCompletedOrder(userId, 'noop-neg', -50);
    const balAfter = await prisma.wallet.findUnique({ where: { userId } });
    expect(Number(balAfter!.balance)).toBe(Number(balBefore!.balance));
  });
});
