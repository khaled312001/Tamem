import { PrismaClient } from '@prisma/client';

import { isProd } from '../config/env.js';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProd ? ['error', 'warn'] : ['query', 'error', 'warn'],
  });

if (!isProd) globalForPrisma.prisma = prisma;
