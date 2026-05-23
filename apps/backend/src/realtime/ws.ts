import type { Server as HttpServer } from 'http';

import { Server as SocketServer } from 'socket.io';

import { UserRole } from '@tamem/types';

import { corsOrigins } from '../config/env.js';
import { verifyAccessToken } from '../modules/auth/tokens.js';
import { logger } from '../utils/logger.js';

/**
 * Bootstraps the realtime layer.
 *
 * Auth: JWT in the connection handshake (`auth.token` or `?token=`).
 * Rooms:
 *   - admin:orders   — ADMINs receive every order:new / order:status
 *   - admin:alerts   — ADMINs receive alert:new
 *   - user:<id>      — the customer/driver receives updates for their orders
 *   - order:<id>     — anyone who joins this room sees that single order's updates
 */
export function bootstrapWs(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: { origin: corsOrigins, credentials: true },
    transports: ['websocket', 'polling'],
  });

  io.use((socket, next) => {
    try {
      const raw =
        (socket.handshake.auth?.token as string | undefined) ??
        (socket.handshake.query?.token as string | undefined);
      if (!raw) return next(new Error('missing token'));
      const payload = verifyAccessToken(raw);
      socket.data.userId = payload.sub;
      socket.data.role = payload.role;
      next();
    } catch (err) {
      logger.debug({ err }, 'socket auth failed');
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, role } = socket.data as { userId: string; role: string };
    logger.debug({ userId, role, sid: socket.id }, 'socket connected');

    // Personal room — used to push order updates to the involved user.
    socket.join(`user:${userId}`);

    // Admin gets dashboard rooms automatically
    if (role === UserRole.ADMIN) {
      socket.join('admin:orders');
      socket.join('admin:alerts');
    }

    // Allow clients (mobile) to follow a specific order's updates.
    socket.on('order:subscribe', (orderId: string) => {
      if (typeof orderId === 'string' && orderId.length < 100) {
        socket.join(`order:${orderId}`);
      }
    });

    socket.on('order:unsubscribe', (orderId: string) => {
      socket.leave(`order:${orderId}`);
    });

    socket.on('disconnect', () => {
      logger.debug({ userId, sid: socket.id }, 'socket disconnected');
    });
  });

  return io;
}
