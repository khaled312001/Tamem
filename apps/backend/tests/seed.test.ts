import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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
  const [users, categories, services, fields, settings] = await Promise.all([
    prisma.user.count(),
    prisma.category.count(),
    prisma.service.count(),
    prisma.serviceField.count(),
    prisma.setting.count(),
  ]);
  return { users, categories, services, fields, settings };
}

describe('seed', () => {
  beforeAll(() => {
    // First run establishes baseline. May be a no-op if seed already ran.
    runSeed();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('produces the expected baseline counts', async () => {
    const s = await snapshot();
    expect(s.users).toBeGreaterThanOrEqual(1); // at least the admin
    expect(s.categories).toBe(6); // restaurants, supermarkets, pharmacies, sweets, flowers, laundry
    expect(s.services).toBe(5); // 3 original + 2 added (laundry, flowers)
    expect(s.fields).toBeGreaterThanOrEqual(11); // 2 (supermarket) + 4 (laundry) + 5 (flowers)
    expect(s.settings).toBe(4);
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
});
