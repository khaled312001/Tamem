import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { PrismaClient } from '@prisma/client';

import { createApp } from '../src/app.js';

const app = createApp();
const prisma = new PrismaClient();

const ADMIN_PHONE = '+201010254819';
const ADMIN_PASSWORD = 'admin123!';

const TEST_PHONE = '+201555000123';
const TEST_PASSWORD = 'TestPass123!';

describe('Auth endpoints', () => {
  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { phone: TEST_PHONE } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { phone: TEST_PHONE } });
    await prisma.$disconnect();
  });

  describe('POST /api/v1/auth/login', () => {
    it('rejects invalid password with 401', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ phone: ADMIN_PHONE, password: 'wrong' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects unknown phone with 401', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ phone: '+201111111111', password: 'whatever' });
      expect(res.status).toBe(401);
    });

    it('rejects malformed phone with 422', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ phone: 'not-a-phone', password: ADMIN_PASSWORD });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('signs in admin with valid credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('ADMIN');
      expect(res.body.data.tokens.accessToken).toBeDefined();
      expect(res.body.data.tokens.refreshToken).toBeDefined();
    });
  });

  describe('POST /api/v1/auth/register', () => {
    it('creates a CUSTOMER and returns tokens', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        name: 'Test User',
        phone: TEST_PHONE,
        password: TEST_PASSWORD,
        city: 'قفط',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.user.role).toBe('CUSTOMER');
      expect(res.body.data.tokens.accessToken).toBeDefined();
    });

    it('rejects duplicate phone with 409', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        name: 'Test User Dup',
        phone: TEST_PHONE,
        password: TEST_PASSWORD,
        city: 'قفط',
      });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('rotates tokens with a valid refresh token', async () => {
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD });
      const oldRefresh = login.body.data.tokens.refreshToken as string;

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: oldRefresh });
      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).not.toBe(oldRefresh);

      // Old token should now be revoked → reuse must fail
      const reuse = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: oldRefresh });
      expect(reuse.status).toBe(401);
    });

    it('rejects invalid refresh token with 401', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'not-a-real-token-just-padding-to-pass-validation' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/me', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app).get('/api/v1/me');
      expect(res.status).toBe(401);
    });

    it('returns profile with a valid token', async () => {
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD });
      const token = login.body.data.tokens.accessToken as string;

      const res = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.phone).toBe(ADMIN_PHONE);
      expect(res.body.data.role).toBe('ADMIN');
    });
  });

  describe('RBAC on /api/v1/admin/*', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app).get('/api/v1/admin/services');
      expect(res.status).toBe(401);
    });

    it('returns 403 for non-admin user', async () => {
      // login as the seeded mock customer
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ phone: '+201000000001', password: 'customer123' });
      const token = login.body.data.tokens.accessToken as string;

      const res = await request(app)
        .get('/api/v1/admin/services')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows admin user', async () => {
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD });
      const token = login.body.data.tokens.accessToken as string;

      const res = await request(app)
        .get('/api/v1/admin/services')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
});
