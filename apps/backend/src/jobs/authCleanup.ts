/**
 * Daily auth-hygiene cron.
 *
 * Two cleanups that don't need to run more than once per day but matter
 * for table size + security posture:
 *
 *   1. Hard-delete RefreshTokens that are revoked or expired more than
 *      7 days ago. We keep recently-revoked rows briefly so we can still
 *      see "this token was rotated at T" in audits.
 *   2. Hard-delete OtpCode rows that are expired or consumed more than
 *      24h ago. There's no audit value beyond that window.
 *
 * Runs every day at 03:30 server time, after the alerts sweep.
 */
import cron from 'node-cron';

import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';

const ONE_DAY_MS = 24 * 60 * 60_000;

export async function runAuthCleanup(): Promise<{ refreshTokens: number; otps: number }> {
  const refreshCutoff = new Date(Date.now() - 7 * ONE_DAY_MS);
  const otpCutoff = new Date(Date.now() - ONE_DAY_MS);

  const refreshTokens = await prisma.refreshToken.deleteMany({
    where: {
      OR: [{ revokedAt: { lt: refreshCutoff } }, { expiresAt: { lt: refreshCutoff } }],
    },
  });

  const otps = await prisma.otpCode.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: otpCutoff } }, { consumedAt: { lt: otpCutoff } }],
    },
  });

  logger.info({ refreshTokens: refreshTokens.count, otps: otps.count }, 'auth cleanup completed');
  return { refreshTokens: refreshTokens.count, otps: otps.count };
}

export function startAuthCleanupCron(): void {
  // 03:30 every day. The 30 minutes offset avoids piling on top of
  // most hosting providers' midnight maintenance windows.
  cron.schedule('30 3 * * *', async () => {
    try {
      await runAuthCleanup();
    } catch (err) {
      logger.error({ err }, 'auth cleanup cron failed');
    }
  });
  logger.info('🧹 auth cleanup cron scheduled (daily 03:30)');
}
