/**
 * EasyKash webhook signature verification — golden-vector test.
 *
 * We seed a deterministic HMAC secret, build a payload that mirrors the
 * shape of EasyKash's real callbacks, compute the SHA-512 HMAC using the
 * documented field order (ProductCode / Amount / ProductType /
 * PaymentMethod / status / easykashRef / customerReference) and assert
 * verifyCallbackSignature returns true. Tampered amounts or status flips
 * must return false — this is the canary for any future code change that
 * weakens the signature check.
 */
import crypto from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { verifyCallbackSignature } from '../src/integrations/easykash.js';
import {
  invalidateEasyKashConfigCache,
  setEasyKashConfig,
} from '../src/modules/payments/easykash.config.js';

const prisma = new PrismaClient();
const TEST_SECRET = 'easykash_test_secret_for_unit_tests_yyy';

function fakeCallback() {
  return {
    ProductCode: 'EDV447111',
    PaymentMethod: 'Vodafone Cash',
    ProductType: 'Direct Pay',
    Amount: '125.00',
    BuyerEmail: 'customer@deliverytamem.com',
    BuyerMobile: '01010101010',
    BuyerName: 'Test Customer',
    Timestamp: '1746166791',
    status: 'PAID',
    voucher: '99887766',
    easykashRef: '900397518',
    VoucherData: 'test',
    customerReference: 'cl1234567890abcdefg',
    signatureHash: '',
  };
}

function signFromSecret(payload: ReturnType<typeof fakeCallback>): string {
  const concat = [
    payload.ProductCode,
    payload.Amount,
    payload.ProductType,
    payload.PaymentMethod,
    payload.status,
    payload.easykashRef,
    payload.customerReference,
  ].join('');
  return crypto.createHmac('sha512', TEST_SECRET).update(concat).digest('hex');
}

describe('EasyKash webhook signature', () => {
  beforeAll(async () => {
    await setEasyKashConfig({ hmacSecret: TEST_SECRET });
    invalidateEasyKashConfigCache();
  });

  afterAll(async () => {
    await setEasyKashConfig({ hmacSecret: '' });
    invalidateEasyKashConfigCache();
    await prisma.$disconnect();
  });

  it('accepts a correctly-signed payload', async () => {
    const payload = fakeCallback();
    payload.signatureHash = signFromSecret(payload);
    const ok = await verifyCallbackSignature(payload);
    expect(ok).toBe(true);
  });

  it('rejects a tampered Amount (attacker reducing the charge)', async () => {
    const payload = fakeCallback();
    payload.signatureHash = signFromSecret(payload);
    payload.Amount = '1.00';
    const ok = await verifyCallbackSignature(payload);
    expect(ok).toBe(false);
  });

  it('rejects a tampered status (FAILED → PAID replay)', async () => {
    const payload = fakeCallback();
    payload.status = 'FAILED';
    payload.signatureHash = signFromSecret(payload);
    payload.status = 'PAID';
    const ok = await verifyCallbackSignature(payload);
    expect(ok).toBe(false);
  });

  it('rejects a completely fabricated signature', async () => {
    const payload = fakeCallback();
    payload.signatureHash = '0'.repeat(128);
    const ok = await verifyCallbackSignature(payload);
    expect(ok).toBe(false);
  });

  it('rejects a malformed signature (not hex)', async () => {
    const payload = fakeCallback();
    payload.signatureHash = 'not-hex-at-all';
    const ok = await verifyCallbackSignature(payload);
    expect(ok).toBe(false);
  });
});
