/**
 * Recurring orders cron — runs hourly and asks the controller to materialize
 * any RecurringOrder rows whose `nextRunAt` has passed.
 *
 * We pick :00 every hour (cron 0 * * * *) so logs are easy to correlate. If
 * the process is offline at the firing time, the next start-up still picks
 * up any overdue templates because the SQL filter is `nextRunAt <= now`.
 */
import cron from 'node-cron';

import { logger } from '../../utils/logger.js';

import { runRecurringOrdersPass } from './recurring.controller.js';

let scheduled: cron.ScheduledTask | null = null;

export function startRecurringOrdersCron(): void {
  if (scheduled) return; // idempotent — hot reload shouldn't stack timers
  scheduled = cron.schedule(
    '0 * * * *',
    async () => {
      try {
        const count = await runRecurringOrdersPass();
        if (count > 0) {
          logger.info({ count }, 'recurring orders generated');
        }
      } catch (err) {
        logger.error({ err }, 'recurring orders pass failed');
      }
    },
    { timezone: process.env.TZ ?? 'Africa/Cairo' },
  );
  logger.info('🔁 recurring orders cron scheduled (every hour)');
}

export function stopRecurringOrdersCron(): void {
  scheduled?.stop();
  scheduled = null;
}
