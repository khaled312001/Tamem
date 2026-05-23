import { createServer } from 'http';

import { Server as SocketServer } from 'socket.io';

import { createApp } from './app.js';
import { corsOrigins, env } from './config/env.js';
import { prisma } from './db/prisma.js';
import { logger } from './utils/logger.js';

async function main() {
  await prisma.$connect();
  logger.info('✅ Database connected');

  const app = createApp();
  const httpServer = createServer(app);

  const io = new SocketServer(httpServer, {
    cors: { origin: corsOrigins, credentials: true },
  });

  io.on('connection', (socket) => {
    logger.debug({ id: socket.id }, 'socket connected');
    socket.on('disconnect', () => logger.debug({ id: socket.id }, 'socket disconnected'));
  });

  // expose io to controllers via app locals if needed
  app.locals.io = io;

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
