/**
 * Product-sync cron — runs every minute and triggers a sync for any
 * merchant config whose `nextSyncAt` is in the past. Each config picks its
 * own interval (15min/30min/hourly/daily); the cron just polls and the
 * engine updates `nextSyncAt` after each run.
 *
 * Serializes runs per config so a merchant with a slow API doesn't
 * monopolize the worker — the bookkeeping happens via a per-run lock on
 * `nextSyncAt` (we update it to `now + interval` BEFORE the fetch starts).
 */
import cron from 'node-cron';

import { prisma } from '../db/prisma.js';
import { nextSyncAfter, runSync } from '../modules/productSync/productSync.engine.js';
import { logger } from '../utils/logger.js';

let busy = false;

export async function runProductSyncSweep(): Promise<{ count: number }> {
  if (busy) return { count: 0 }; // overlap guard
  busy = true;
  let count = 0;
  try {
    const due = await prisma.merchantApiConfig.findMany({
      where: {
        isActive: true,
        syncInterval: { not: 'DISABLED' },
        nextSyncAt: { lte: new Date() },
      },
      take: 20, // small batch per minute to keep tail latency sane
    });
    for (const cfg of due) {
      // Optimistically bump the next-run time BEFORE the request fires.
      // If the request crashes mid-flight, the next tick can pick it up.
      await prisma.merchantApiConfig.update({
        where: { id: cfg.id },
        data: { nextSyncAt: nextSyncAfter(cfg.syncInterval) },
      });
      try {
        await runSync(cfg, { trigger: 'AUTO' });
        count++;
      } catch (err) {
        logger.error({ err, configId: cfg.id }, 'product sync run failed');
      }
    }
  } finally {
    busy = false;
  }
  return { count };
}

export function startProductSyncCron(): void {
  cron.schedule('* * * * *', async () => {
    try {
      await runProductSyncSweep();
    } catch (err) {
      logger.error({ err }, 'product sync sweep failed');
    }
  });
  logger.info('🔁 product sync cron scheduled (every minute, interval-driven)');
}
