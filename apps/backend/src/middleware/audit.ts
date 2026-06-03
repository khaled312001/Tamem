/**
 * Admin audit middleware.
 *
 * Captures every state-changing request to /api/v1/admin/* and persists
 * a row to AdminAuditLog. Read requests (GET / HEAD / OPTIONS) are
 * skipped — we want the answer to "who changed X" only, not "who
 * looked at X".
 *
 * The middleware is non-blocking: we wrap res.end() so we can record
 * the final HTTP status, and we never throw out of the audit path —
 * a logging failure must not break the underlying admin action.
 *
 * Payloads are sanitized: password / token / secret fields are blanked
 * before persistence so we don't end up with sensitive values in the
 * audit table.
 */
import type { RequestHandler } from 'express';

import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';

const REDACT_KEYS = new Set([
  'password',
  'newPassword',
  'currentPassword',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'fcmToken',
  'idToken',
  'secret',
  'apiKey',
  'hmac',
  'hmacSecret',
  'paymobHmac',
  'easykashApiKey',
  'easykashHmacSecret',
]);

function redact(input: unknown, depth = 0): unknown {
  if (depth > 4) return '[deep]';
  if (input == null) return input;
  if (Array.isArray(input)) return input.map((v) => redact(v, depth + 1));
  if (typeof input !== 'object') return input;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (REDACT_KEYS.has(k)) {
      out[k] = '[redacted]';
    } else {
      out[k] = redact(v, depth + 1);
    }
  }
  return out;
}

function inferTarget(path: string): { type: string | null; id: string | null } {
  // /api/v1/admin/orders/abc → { type: 'order', id: 'abc' }
  const m = path.match(/\/admin\/([^/?]+)(?:\/([^/?]+))?/);
  if (!m) return { type: null, id: null };
  const raw = m[1] ?? '';
  // Drop trailing 's' to normalize: orders → order, services → service.
  const singular = raw.endsWith('ies')
    ? raw.slice(0, -3) + 'y'
    : raw.endsWith('s')
      ? raw.slice(0, -1)
      : raw;
  return { type: singular, id: m[2] ?? null };
}

export const adminAuditLog: RequestHandler = (req, res, next) => {
  // Only track writes — reads carry no risk worth journaling.
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  if (!req.user) return next();

  const startedAt = Date.now();
  const originalEnd = res.end.bind(res);

  // Cast to a permissive signature so we can wrap without fighting Express's
  // overloaded `end` typings.
  (res as unknown as { end: (...args: unknown[]) => unknown }).end = function patchedEnd(
    ...args: unknown[]
  ) {
    const status = res.statusCode;
    const { type, id } = inferTarget(req.path);
    const payload = redact(req.body) as unknown;

    // Fire-and-forget the audit row — we don't want a slow DB to block the
    // response, and we never want a logging failure to surface as a 500.
    prisma.adminAuditLog
      .create({
        data: {
          actorId: req.user!.id,
          actorRole: req.user!.role,
          method: req.method,
          path: req.originalUrl.slice(0, 250),
          targetType: type,
          targetId: id,
          payload: payload as never,
          ip: req.ip ?? null,
          userAgent: (req.headers['user-agent'] as string | undefined)?.slice(0, 500) ?? null,
          status,
        },
      })
      .catch((err) => {
        logger.warn({ err, path: req.path }, 'audit log write failed');
      });

    logger.debug({ path: req.path, status, ms: Date.now() - startedAt }, 'admin write');
    return originalEnd(...(args as Parameters<typeof originalEnd>));
  };

  next();
};
