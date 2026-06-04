import { createServer } from 'http';

import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './db/prisma.js';
import {
  autoResumeIfPossible as autoResumeWhatsApp,
  onStatusChange as onWhatsAppStatus,
  getStatus as getWhatsAppStatus,
} from './integrations/wppconnect.js';
import { startAlertsCron } from './jobs/alerts.js';
import { startAuthCleanupCron } from './jobs/authCleanup.js';
import { startRecurringOrdersCron } from './modules/recurring/recurring.cron.js';
import { emitWhatsAppStatus } from './realtime/channels.js';
import { bootstrapWs } from './realtime/ws.js';
import { logger } from './utils/logger.js';

async function main() {
  await prisma.$connect();
  logger.info('✅ Database connected');

  const app = createApp();
  const httpServer = createServer(app);

  const io = bootstrapWs(httpServer);
  app.locals.io = io;

  startAlertsCron(io);
  startAuthCleanupCron();
  startRecurringOrdersCron();

  // Broadcast WhatsApp bridge status changes (QR ready / connected / disconnected)
  // to the admin dashboard so it can render the QR and connection state live.
  onWhatsAppStatus(() => emitWhatsAppStatus(io, getWhatsAppStatus()));

  // Auto-resume the saved WhatsApp session if one exists. The admin only needs
  // to scan the QR once; from then on, every backend restart reconnects silently.
  void autoResumeWhatsApp();

  httpServer.listen(env.PORT, () => {
    logger.info(`🚀 Tamem API listening on http://localhost:${env.PORT}`);
    logger.info(`   environment: ${env.NODE_ENV}`);
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    httpServer.close(() => logger.info('http server closed'));
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'fatal error during bootstrap');
  process.exit(1);
});
