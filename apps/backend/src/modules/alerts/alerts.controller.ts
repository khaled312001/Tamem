/**
 * Alerts — operations control surface.
 *
 * Endpoints:
 *   GET  /admin/alerts            — filtered list + counts
 *   GET  /admin/alerts/stats      — counts only (for header cards on poll)
 *   GET  /admin/alerts/:id        — single alert with full detail
 *   POST /admin/alerts/:id/ack    — mark "working on it"
 *   POST /admin/alerts/:id/resolve
 *   POST /admin/alerts/:id/dismiss
 *   POST /admin/alerts/:id/escalate
 *   POST /admin/alerts/:id/note   — append internal note
 *
 * Every state-change emits a socket event (`alert:updated` or `alert:new`)
 * so the dashboard can react without polling.
 */
import type { RequestHandler } from 'express';
import type { Server as SocketServer } from 'socket.io';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { ConflictError, NotFoundError } from '../../utils/errors.js';
import { ok } from '../../utils/response.js';

import { runAlertSweep } from '../../jobs/alerts.js';

const param = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new NotFoundError('Resource');
  return v;
};

const boolFromQuery = z
  .union([z.boolean(), z.string()])
  .transform((v) => {
    if (typeof v === 'boolean') return v;
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === '1') return true;
    if (s === 'false' || s === '0') return false;
    return undefined;
  })
  .optional();

const ALERT_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED', 'ESCALATED'] as const;
const ALERT_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const ALERT_CATEGORIES = [
  'ORDER',
  'PAYMENT',
  'DRIVER',
  'MERCHANT',
  'CUSTOMER',
  'COMPLAINT',
  'DELAY',
  'SYSTEM',
] as const;

const listQuery = z.object({
  // Legacy boolean alias — kept so older URLs (resolved=true/false) keep working.
  resolved: boolFromQuery,
  status: z.enum(ALERT_STATUSES).optional(),
  severity: z.enum(ALERT_SEVERITIES).optional(),
  category: z.enum(ALERT_CATEGORIES).optional(),
  /** Free-text search — order number / customer name / phone / driver / merchant. */
  q: z.string().trim().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /** Convenience: "today" / "week" / "custom". When set, takes priority over from/to. */
  preset: z.enum(['today', 'week', 'custom']).optional(),
  limit: z.coerce.number().int().positive().max(500).default(200),
});

const resolveSchema = z.object({
  note: z.string().trim().min(1).max(500),
});
const noteSchema = z.object({
  note: z.string().trim().min(1).max(500),
});

/** Apply a date preset on top of from/to without surprising the caller. */
function resolveDateRange(
  preset?: 'today' | 'week' | 'custom',
  from?: Date,
  to?: Date,
): { from?: Date; to?: Date } {
  if (preset === 'today') {
    const f = new Date();
    f.setHours(0, 0, 0, 0);
    return { from: f, to: new Date() };
  }
  if (preset === 'week') {
    return { from: new Date(Date.now() - 7 * 86_400_000), to: new Date() };
  }
  return { from, to };
}

/**
 * Centralized "is this alert currently in your face" logic. The dashboard
 * uses this everywhere — counts + tab filters + sort order. Keeping it as
 * a single helper means we don't drift between "open == !resolved" and
 * "open == status IN (OPEN, ACKNOWLEDGED, ESCALATED)".
 */
const ACTIVE_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'ESCALATED'] as const;

async function computeStats(): Promise<{
  critical: number;
  high: number;
  medium: number;
  low: number;
  resolvedToday: number;
  totalActive: number;
  byCategory: Record<string, number>;
}> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [bySev, resolvedToday, total, byCatRaw] = await Promise.all([
    prisma.alert.groupBy({
      by: ['severity'],
      where: { status: { in: [...ACTIVE_STATUSES] } },
      _count: true,
    }),
    prisma.alert.count({
      where: { status: 'RESOLVED', resolvedAt: { gte: startOfDay } },
    }),
    prisma.alert.count({ where: { status: { in: [...ACTIVE_STATUSES] } } }),
    prisma.alert.groupBy({
      by: ['category'],
      where: { status: { in: [...ACTIVE_STATUSES] } },
      _count: true,
    }),
  ]);
  const sevCount = (sev: string) => bySev.find((b) => b.severity === sev)?._count ?? 0;
  const byCategory: Record<string, number> = {};
  for (const c of byCatRaw) byCategory[c.category] = c._count;
  return {
    critical: sevCount('CRITICAL'),
    high: sevCount('HIGH'),
    medium: sevCount('MEDIUM'),
    low: sevCount('LOW'),
    resolvedToday,
    totalActive: total,
    byCategory,
  };
}

export const stats: RequestHandler = async (_req, res, next) => {
  try {
    ok(res, await computeStats());
  } catch (err) {
    next(err);
  }
};

/**
 * Build the Prisma WHERE clause for the alert list, including a full-text
 * search across order number / customer name+phone / merchant name / driver name.
 *
 * `q` triggers a join via OR conditions — fast enough for the dashboard's
 * 200-row cap.
 */
async function buildWhere(q: z.infer<typeof listQuery>) {
  const where: Record<string, unknown> = {};

  // Status filter — explicit `status` wins over the legacy `resolved` boolean.
  if (q.status) {
    where.status = q.status;
  } else if (q.resolved !== undefined) {
    where.status = q.resolved ? 'RESOLVED' : { in: [...ACTIVE_STATUSES] };
  }

  if (q.severity) where.severity = q.severity;
  if (q.category) where.category = q.category;

  const range = resolveDateRange(q.preset, q.from, q.to);
  if (range.from || range.to) {
    where.createdAt = {
      ...(range.from ? { gte: range.from } : {}),
      ...(range.to ? { lte: range.to } : {}),
    };
  }

  if (q.q) {
    const term = q.q;
    // Find candidate order IDs first — Prisma can't OR across nested
    // relations cleanly, so we resolve to IDs and inject.
    const matchingOrderIds = await prisma.order.findMany({
      where: {
        OR: [
          { orderNumber: { contains: term } },
          { customer: { name: { contains: term } } },
          { customer: { phone: { contains: term } } },
          { assignedDriver: { name: { contains: term } } },
        ],
      },
      select: { id: true },
      take: 100,
    });
    where.OR = [
      { titleAr: { contains: term } },
      { descriptionAr: { contains: term } },
      { relatedOrderId: { in: matchingOrderIds.map((o) => o.id) } },
    ];
  }

  return where;
}

export const list: RequestHandler = async (req, res, next) => {
  try {
    const q = listQuery.parse(req.query);
    const where = await buildWhere(q);

    const alerts = await prisma.alert.findMany({
      where,
      orderBy: [
        // Critical first, then newest. Severity is an enum so desc puts
        // CRITICAL on top.
        { severity: 'desc' },
        { createdAt: 'desc' },
      ],
      include: {
        relatedOrder: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            updatedAt: true,
            createdAt: true,
            customer: { select: { id: true, name: true, phone: true } },
            assignedDriver: { select: { id: true, name: true, phone: true } },
            merchantId: true,
          },
        },
        resolvedBy: { select: { id: true, name: true } },
      },
      take: q.limit,
    });

    const merchantIds = Array.from(
      new Set(alerts.map((a) => a.relatedOrder?.merchantId).filter((id): id is string => !!id)),
    );
    const merchants = merchantIds.length
      ? await prisma.merchantProfile.findMany({
          where: { id: { in: merchantIds } },
          select: { id: true, storeNameAr: true },
        })
      : [];
    const merchantById = new Map(merchants.map((m) => [m.id, m]));
    const decorated = alerts.map((a) => ({
      ...a,
      merchantName: a.relatedOrder?.merchantId
        ? (merchantById.get(a.relatedOrder.merchantId)?.storeNameAr ?? null)
        : null,
    }));

    ok(res, decorated, { stats: await computeStats() });
  } catch (err) {
    next(err);
  }
};

export const getOne: RequestHandler = async (req, res, next) => {
  try {
    const id = param(req.params.id);
    const alert = await prisma.alert.findUnique({
      where: { id },
      include: {
        relatedOrder: {
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            assignedDriver: { select: { id: true, name: true, phone: true } },
            service: { select: { nameAr: true, category: true } },
            statusHistory: {
              orderBy: { createdAt: 'asc' },
              include: { changedBy: { select: { id: true, name: true } } },
            },
          },
        },
        resolvedBy: { select: { id: true, name: true } },
      },
    });
    if (!alert) throw new NotFoundError('Alert');
    ok(res, alert);
  } catch (err) {
    next(err);
  }
};

/** Helper used by every action — emit + invalidate. */
function emitAlertUpdated(req: { app: { locals: Record<string, unknown> } }, alert: unknown): void {
  const io = req.app.locals.io as SocketServer | undefined;
  io?.emit('alert:updated', alert);
}

export const ack: RequestHandler = async (req, res, next) => {
  try {
    const id = param(req.params.id);
    const alert = await prisma.alert.update({
      where: { id },
      data: {
        status: 'ACKNOWLEDGED',
        ackedById: req.user!.id,
        ackedAt: new Date(),
      },
    });
    emitAlertUpdated(req, alert);
    ok(res, alert);
  } catch (err) {
    next(err);
  }
};

export const resolve: RequestHandler = async (req, res, next) => {
  try {
    const id = param(req.params.id);
    const input = resolveSchema.parse(req.body);
    const existing = await prisma.alert.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Alert');
    if (existing.status === 'RESOLVED') {
      throw new ConflictError('ALREADY_RESOLVED', 'هذا التنبيه تم حله من قبل');
    }
    const now = new Date();
    const duration = Math.round((now.getTime() - existing.createdAt.getTime()) / 1000);
    const alert = await prisma.alert.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        isResolved: true,
        resolvedById: req.user!.id,
        resolvedAt: now,
        resolutionNotes: input.note,
        resolutionDurationSec: duration,
      },
      include: { resolvedBy: { select: { id: true, name: true } } },
    });
    emitAlertUpdated(req, alert);
    ok(res, alert);
  } catch (err) {
    next(err);
  }
};

export const dismiss: RequestHandler = async (req, res, next) => {
  try {
    const id = param(req.params.id);
    const input = resolveSchema.parse(req.body);
    const alert = await prisma.alert.update({
      where: { id },
      data: {
        status: 'DISMISSED',
        isResolved: true,
        dismissedById: req.user!.id,
        dismissedAt: new Date(),
        resolutionNotes: input.note,
      },
    });
    emitAlertUpdated(req, alert);
    ok(res, alert);
  } catch (err) {
    next(err);
  }
};

export const escalate: RequestHandler = async (req, res, next) => {
  try {
    const id = param(req.params.id);
    const alert = await prisma.alert.update({
      where: { id },
      data: {
        status: 'ESCALATED',
        severity: 'CRITICAL',
        escalatedById: req.user!.id,
        escalatedAt: new Date(),
      },
    });
    emitAlertUpdated(req, alert);
    ok(res, alert);
  } catch (err) {
    next(err);
  }
};

/**
 * Manual trigger so admins don't have to wait for the next 5-min tick when
 * they just changed a threshold setting or want to verify the sweep itself
 * is healthy. Returns the number of alerts created.
 */
export const runSweep: RequestHandler = async (req, res, next) => {
  try {
    const io = req.app.locals.io as SocketServer | undefined;
    const result = await runAlertSweep(io);
    ok(res, { created: result.created, ranAt: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
};

export const addNote: RequestHandler = async (req, res, next) => {
  try {
    const id = param(req.params.id);
    const input = noteSchema.parse(req.body);
    const existing = await prisma.alert.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Alert');
    // We append to the resolutionNotes column (it's the only free-text field we
    // have). Each note prefixed with the author + timestamp for traceability.
    const author = req.user!.id;
    const prefix = `[${new Date().toISOString().slice(0, 16).replace('T', ' ')} · ${author}]`;
    const next = existing.resolutionNotes
      ? `${existing.resolutionNotes}\n${prefix} ${input.note}`
      : `${prefix} ${input.note}`;
    const alert = await prisma.alert.update({
      where: { id },
      data: { resolutionNotes: next },
    });
    emitAlertUpdated(req, alert);
    ok(res, alert);
  } catch (err) {
    next(err);
  }
};
