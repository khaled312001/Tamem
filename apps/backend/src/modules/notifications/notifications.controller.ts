import type { RequestHandler } from 'express';

import { prisma } from '../../db/prisma.js';
import { NotFoundError, UnauthorizedError } from '../../utils/errors.js';
import { ok, paginated } from '../../utils/response.js';

const param = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new NotFoundError('Resource');
  return v;
};

export const list: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const page = Number(req.query.page ?? 1);
    const pageSize = Math.min(Number(req.query.pageSize ?? 30), 100);
    const [items, total, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user.id },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { sentAt: 'desc' },
      }),
      prisma.notification.count({ where: { userId: req.user.id } }),
      prisma.notification.count({ where: { userId: req.user.id, isRead: false } }),
    ]);
    paginated(res, items, { page, pageSize, total });
    // Note: paginated already returned; we cannot mutate response. Front-end can call /unread-count instead.
    void unread;
  } catch (err) {
    next(err);
  }
};

export const unreadCount: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const count = await prisma.notification.count({
      where: { userId: req.user.id, isRead: false },
    });
    ok(res, { count });
  } catch (err) {
    next(err);
  }
};

export const markRead: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const notif = await prisma.notification.updateMany({
      where: { id: param(req.params.id), userId: req.user.id },
      data: { isRead: true, readAt: new Date() },
    });
    ok(res, { updated: notif.count });
  } catch (err) {
    next(err);
  }
};

export const markAllRead: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const r = await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    ok(res, { updated: r.count });
  } catch (err) {
    next(err);
  }
};

/**
 * Helper for other modules. Creates a notification AND fans out to channels (PUSH/WHATSAPP)
 * which are intentionally side-effect-free in Phase 1 (logs only).
 */
export async function notify(
  userId: string,
  type: 'ORDER_STATUS' | 'PROMO' | 'SYSTEM' | 'ALERT',
  titleAr: string,
  bodyAr: string,
  options: {
    title?: string;
    body?: string;
    channel?: 'PUSH' | 'WHATSAPP' | 'IN_APP';
    data?: Record<string, unknown>;
  } = {},
) {
  return prisma.notification.create({
    data: {
      userId,
      type,
      title: options.title ?? titleAr,
      titleAr,
      body: options.body ?? bodyAr,
      bodyAr,
      data: options.data,
      channel: options.channel ?? 'IN_APP',
    },
  });
}
