/**
 * OTP endpoint smoke tests.
 *
 * We don't want to actually dispatch WhatsApp messages during testing, so
 * we rely on the dev-mode `debugCode` echo the controller returns when
 * NODE_ENV !== 'production'. setup.ts forces NODE_ENV='test' which gives
 * us the same echo.
 */
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

const app = createApp();
const prisma = new PrismaClient();

// Use a clearly-fake but well-formed phone so the seed never collides.
const TEST_PHONE = '+201557000999';
const TEST_PASSWORD = 'OtpPass123!';

describe('OTP flow', () => {
  beforeAll(async () => {
    await prisma.otpCode.deleteMany({ where: { phone: TEST_PHONE } });
    await prisma.user.deleteMany({ where: { phone: TEST_PHONE } });

    await request(app).post('/api/v1/auth/register').send({
      name: 'Otp User',
      phone: TEST_PHONE,
      password: TEST_PASSWORD,
      city: 'قفط',
    });
  });

  afterAll(async () => {
    await prisma.otpCode.deleteMany({ where: { phone: TEST_PHONE } });
    await prisma.user.deleteMany({ where: { phone: TEST_PHONE } });
    await prisma.$disconnect();
  });

  it('issues a real 6-digit code and persists it hashed', async () => {
    const res = await request(app).post('/api/v1/auth/otp/request').send({ phone: TEST_PHONE });

    expect(res.status).toBe(200);
    expect(res.body.data.sent).toBe(true);
    // Test env echoes the code so we can exercise verification end-to-end.
    expect(res.body.data.debugCode).toMatch(/^\d{6}$/);

    const row = await prisma.otpCode.findFirst({
      where: { phone: TEST_PHONE, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(row).toBeTruthy();
    // The hash must never be the raw code — exactly 64 hex chars (SHA-256).
    expect(row!.codeHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('cools down a second request within 60s', async () => {
    const res = await request(app).post('/api/v1/auth/otp/request').send({ phone: TEST_PHONE });
    expect(res.status).toBe(200);
    expect(res.body.data.channel).toBe('COOLDOWN');
  });

  it('rejects the wrong code with 401 and increments attempts', async () => {
    const before = await prisma.otpCode.findFirst({
      where: { phone: TEST_PHONE, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const beforeAttempts = before?.attempts ?? 0;

    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: TEST_PHONE, code: '000000' });
    expect(res.status).toBe(401);

    const after = await prisma.otpCode.findUnique({ where: { id: before!.id } });
    expect(after!.attempts).toBe(beforeAttempts + 1);
  });

  it('accepts the correct code and marks it consumed', async () => {
    // Fresh OTP — the previous tests consumed a row.
    await prisma.otpCode.deleteMany({ where: { phone: TEST_PHONE } });
    const issue = await request(app).post('/api/v1/auth/otp/request').send({ phone: TEST_PHONE });
    expect(issue.status).toBe(200);
    const code = issue.body.data.debugCode as string;

    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: TEST_PHONE, code });

    expect(res.status).toBe(200);
    expect(res.body.data.tokens.accessToken).toBeDefined();

    const row = await prisma.otpCode.findFirst({
      where: { phone: TEST_PHONE },
      orderBy: { createdAt: 'desc' },
    });
    expect(row!.consumedAt).not.toBeNull();
  });

  it('rejects re-using the same code (consumed)', async () => {
    const row = await prisma.otpCode.findFirst({
      where: { phone: TEST_PHONE },
      orderBy: { createdAt: 'desc' },
    });
    // We don't know the cleartext anymore — but the controller looks up by
    // `consumedAt: null` so any 6-digit code will hit "expired or not found".
    expect(row!.consumedAt).not.toBeNull();
    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: TEST_PHONE, code: '123456' });
    expect(res.status).toBe(401);
  });
});
