import { createServer } from 'http';

import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './db/prisma.js';
import { startAlertsCron } from './jobs/alerts.js';
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
