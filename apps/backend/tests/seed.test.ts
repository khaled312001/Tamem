import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Resolve apps/backend root so the test can be invoked from any cwd.
const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, '..');

const prisma = new PrismaClient();

function runSeed() {
  execSync('pnpm db:seed', {
    cwd: backendRoot,
    stdio: 'pipe',
    env: { ...process.env },
  });
}

async function snapshot() {
  const [users, categories, services, fields, settings, mockOrders] = await Promise.all([
    prisma.user.count(),
    prisma.category.count(),
    prisma.service.count(),
    prisma.serviceField.count(),
    prisma.setting.count(),
    prisma.order.count({ where: { orderNumber: { startsWith: 'TMM-MOCK-' } } }),
  ]);
  return { users, categories, services, fields, settings, mockOrders };
}

describe('seed', () => {
  beforeAll(() => {
    runSeed();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('produces the expected baseline counts', async () => {
    const s = await snapshot();
    expect(s.users).toBeGreaterThanOrEqual(3); // admin + mock customer + mock driver
    expect(s.categories).toBe(9);
    expect(s.services).toBe(5);
    expect(s.fields).toBeGreaterThanOrEqual(5);
    expect(s.settings).toBe(6);
    expect(s.mockOrders).toBe(5);
  });

  it('is idempotent — re-running does not duplicate rows', async () => {
    const before = await snapshot();
    runSeed();
    const after = await snapshot();
    expect(after).toEqual(before);
  });

  it('keeps a single admin user with the expected phone', async () => {
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
    expect(admins).toHaveLength(1);
    expect(admins[0]!.phone).toBe('+201010254819');
  });

  it('settings keys are unique', async () => {
    const settings = await prisma.setting.findMany();
    const keys = settings.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('service keys are unique', async () => {
    const services = await prisma.service.findMany();
    const keys = services.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
