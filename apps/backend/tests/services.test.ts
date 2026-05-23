import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { PrismaClient } from '@prisma/client';

import { createApp } from '../src/app.js';

const app = createApp();
const prisma = new PrismaClient();

let adminToken: string;
let customerToken: string;
let createdServiceId: string;
let createdFieldId: string;

beforeAll(async () => {
  const admin = await request(app)
    .post('/api/v1/auth/login')
    .send({ phone: '+201010254819', password: 'admin123!' });
  adminToken = admin.body.data.tokens.accessToken;

  const customer = await request(app)
    .post('/api/v1/auth/login')
    .send({ phone: '+201000000001', password: 'customer123' });
  customerToken = customer.body.data.tokens.accessToken;
});

afterAll(async () => {
  if (createdServiceId) {
    await prisma.serviceField.deleteMany({ where: { serviceId: createdServiceId } });
    await prisma.service.deleteMany({ where: { id: createdServiceId } });
  }
  await prisma.service.deleteMany({ where: { key: { contains: '-copy-' } } });
  await prisma.service.deleteMany({ where: { key: { startsWith: 'test-service-' } } });
  await prisma.$disconnect();
});

describe('Services CRUD (admin)', () => {
  it('GET /admin/services returns list with _count', async () => {
    const res = await request(app)
      .get('/api/v1/admin/services')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0]._count).toBeDefined();
  });

  it('POST /admin/services creates a service', async () => {
    const res = await request(app)
      .post('/api/v1/admin/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        key: `test-service-${Date.now()}`,
        name: 'Test Service',
        nameAr: 'خدمة اختبار',
        category: 'DELIVERY',
        pricingMethod: 'FIXED',
        basePrice: 50,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    createdServiceId = res.body.data.id;
  });

  it('POST /admin/services/:id/fields adds a field', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/services/${createdServiceId}/fields`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        key: 'order_text',
        label: 'Notes',
        labelAr: 'ملاحظات',
        type: 'TEXTAREA',
        isRequired: false,
        sortOrder: 0,
      });
    expect(res.status).toBe(201);
    createdFieldId = res.body.data.id;
  });

  it('PATCH /admin/services/:id/fields/reorder works', async () => {
    // Add a second field
    const second = await request(app)
      .post(`/api/v1/admin/services/${createdServiceId}/fields`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        key: 'second_field',
        label: 'Phone',
        labelAr: 'الهاتف',
        type: 'PHONE',
        isRequired: true,
        sortOrder: 1,
      });
    expect(second.status).toBe(201);

    const res = await request(app)
      .patch(`/api/v1/admin/services/${createdServiceId}/fields/reorder`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fieldIds: [second.body.data.id, createdFieldId] });
    expect(res.status).toBe(200);
    expect(res.body.data.reordered).toBe(2);
  });

  it('POST /admin/services/:id/duplicate copies service + fields', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/services/${createdServiceId}/duplicate`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(201);
    expect(res.body.data.key).toContain('-copy-');
    expect(res.body.data.isActive).toBe(false);
    expect(res.body.data.fields).toHaveLength(2);
  });

  it('DELETE /admin/services/:id soft-deletes', async () => {
    const res = await request(app)
      .delete(`/api/v1/admin/services/${createdServiceId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(204);

    const check = await prisma.service.findUnique({ where: { id: createdServiceId } });
    expect(check?.isActive).toBe(false);
  });

  it('DELETE service with active orders returns 409', async () => {
    const mockServiceWithOrders = await prisma.service.findFirst({
      where: { key: 'delivery-supermarket' },
    });
    const res = await request(app)
      .delete(`/api/v1/admin/services/${mockServiceWithOrders!.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('non-admin gets 403 on /admin/services', async () => {
    const res = await request(app)
      .get('/api/v1/admin/services')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
  });
});

describe('Services public endpoints', () => {
  it('GET /services returns active services only', async () => {
    const res = await request(app).get('/api/v1/services');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    // All returned should be isActive
    expect(res.body.data.every((s: { isActive: boolean }) => s.isActive)).toBe(true);
  });

  it('GET /services/:id returns service with fields', async () => {
    const list = await request(app).get('/api/v1/services');
    const firstId = list.body.data[0].id;
    const res = await request(app).get(`/api/v1/services/${firstId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.fields).toBeDefined();
    expect(Array.isArray(res.body.data.fields)).toBe(true);
  });
});
