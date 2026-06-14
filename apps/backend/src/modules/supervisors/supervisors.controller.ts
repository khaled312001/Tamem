/**
 * Supervisors module — admin controller.
 *
 * Endpoints (all mounted under /admin/supervisors and protected upstream by
 * requireAuth + requireRole(ADMIN)):
 *   GET    /                       → list supervisors + shifts + on-shift flag
 *   POST   /                       → create supervisor
 *   PATCH  /:id                    → update supervisor (partial)
 *   DELETE /:id                    → soft-delete (preserves dispatch history)
 *   POST   /:id/shifts             → add shift
 *   PATCH  /shifts/:shiftId        → update shift (partial)
 *   DELETE /shifts/:shiftId        → hard-delete shift
 *   GET    /current                → the supervisor currently on duty (or null)
 *   GET    /:id/reports            → dispatch counts + daily breakdown
 */
import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { NotFoundError } from '../../utils/errors.js';
import { created, ok } from '../../utils/response.js';

import { getCurrentSupervisor } from './supervisors.service.js';

// ---------- helpers ----------

const param = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new NotFoundError('Resource');
  return v;
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const PHONE = /^\+?\d{8,15}$/;

const shiftKindSchema = z.enum(['MORNING', 'EVENING', 'CUSTOM']);

const createSupervisorSchema = z.object({
  name: z.string().trim().min(1).max(120),
  whatsappPhone: z.string().trim().regex(PHONE, 'رقم واتساب غير صالح'),
  isActive: z.boolean().default(true),
  notes: z.string().max(500).optional(),
});

const updateSupervisorSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  whatsappPhone: z.string().trim().regex(PHONE).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
});

const daysOfWeekSchema = z.array(z.number().int().min(0).max(6)).max(7).default([]);

const addShiftSchema = z.object({
  kind: shiftKindSchema,
  startTime: z.string().regex(HHMM, 'startTime must be HH:mm'),
  endTime: z.string().regex(HHMM, 'endTime must be HH:mm'),
  daysOfWeek: daysOfWeekSchema,
  isActive: z.boolean().default(true),
});

const updateShiftSchema = z.object({
  kind: shiftKindSchema.optional(),
  startTime: z.string().regex(HHMM).optional(),
  endTime: z.string().regex(HHMM).optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  isActive: z.boolean().optional(),
});

const reportsQuerySchema = z.object({
  period: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
});

// ---------- controllers ----------

/** GET /admin/supervisors — list + active shifts + isOnShiftNow */
export const list: RequestHandler = async (_req, res, next) => {
  try {
    const [supervisors, current] = await Promise.all([
      prisma.supervisor.findMany({
        orderBy: { createdAt: 'desc' },
        include: { shifts: { orderBy: { createdAt: 'asc' } } },
      }),
      getCurrentSupervisor(),
    ]);
    const currentId = current?.id ?? null;
    const enriched = supervisors.map((s) => ({
      ...s,
      isOnShiftNow: s.id === currentId,
    }));
    ok(res, { supervisors: enriched });
  } catch (err) {
    next(err);
  }
};

/** POST /admin/supervisors — create */
export const create: RequestHandler = async (req, res, next) => {
  try {
    const input = createSupervisorSchema.parse(req.body);
    const supervisor = await prisma.supervisor.create({
      data: {
        name: input.name,
        whatsappPhone: input.whatsappPhone,
        isActive: input.isActive,
        notes: input.notes ?? null,
      },
    });
    created(res, supervisor);
  } catch (err) {
    next(err);
  }
};

/** PATCH /admin/supervisors/:id — partial update */
export const update: RequestHandler = async (req, res, next) => {
  try {
    const id = param(req.params.id);
    const input = updateSupervisorSchema.parse(req.body);
    const existing = await prisma.supervisor.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Supervisor', 'المشرف غير موجود');

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.whatsappPhone !== undefined) data.whatsappPhone = input.whatsappPhone;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.notes !== undefined) data.notes = input.notes;

    const updated = await prisma.supervisor.update({ where: { id }, data });
    ok(res, updated);
  } catch (err) {
    next(err);
  }
};

/** DELETE /admin/supervisors/:id — soft-delete (isActive=false) */
export const softDelete: RequestHandler = async (req, res, next) => {
  try {
    const id = param(req.params.id);
    const existing = await prisma.supervisor.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundError('Supervisor', 'المشرف غير موجود');
    await prisma.supervisor.update({ where: { id }, data: { isActive: false } });
    ok(res, { id, isActive: false });
  } catch (err) {
    next(err);
  }
};

/** POST /admin/supervisors/:id/shifts — add shift */
export const addShift: RequestHandler = async (req, res, next) => {
  try {
    const supervisorId = param(req.params.id);
    const sup = await prisma.supervisor.findUnique({
      where: { id: supervisorId },
      select: { id: true },
    });
    if (!sup) throw new NotFoundError('Supervisor', 'المشرف غير موجود');
    const input = addShiftSchema.parse(req.body);
    const shift = await prisma.supervisorShift.create({
      data: {
        supervisorId,
        kind: input.kind,
        startTime: input.startTime,
        endTime: input.endTime,
        daysOfWeek: input.daysOfWeek,
        isActive: input.isActive,
      },
    });
    created(res, shift);
  } catch (err) {
    next(err);
  }
};

/** PATCH /admin/supervisors/shifts/:shiftId — partial update */
export const updateShift: RequestHandler = async (req, res, next) => {
  try {
    const shiftId = param(req.params.shiftId);
    const existing = await prisma.supervisorShift.findUnique({ where: { id: shiftId } });
    if (!existing) throw new NotFoundError('Shift', 'الوردية غير موجودة');
    const input = updateShiftSchema.parse(req.body);
    const data: Record<string, unknown> = {};
    if (input.kind !== undefined) data.kind = input.kind;
    if (input.startTime !== undefined) data.startTime = input.startTime;
    if (input.endTime !== undefined) data.endTime = input.endTime;
    if (input.daysOfWeek !== undefined) data.daysOfWeek = input.daysOfWeek;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    const updated = await prisma.supervisorShift.update({ where: { id: shiftId }, data });
    ok(res, updated);
  } catch (err) {
    next(err);
  }
};

/** DELETE /admin/supervisors/shifts/:shiftId — hard delete */
export const deleteShift: RequestHandler = async (req, res, next) => {
  try {
    const shiftId = param(req.params.shiftId);
    const existing = await prisma.supervisorShift.findUnique({
      where: { id: shiftId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError('Shift', 'الوردية غير موجودة');
    await prisma.supervisorShift.delete({ where: { id: shiftId } });
    ok(res, { id: shiftId, deleted: true });
  } catch (err) {
    next(err);
  }
};

/** GET /admin/supervisors/current — who's on shift right now? */
export const getCurrent: RequestHandler = async (_req, res, next) => {
  try {
    const sup = await getCurrentSupervisor();
    if (!sup) {
      ok(res, { supervisor: null });
      return;
    }
    ok(res, {
      supervisor: {
        id: sup.id,
        name: sup.name,
        whatsappPhone: sup.whatsappPhone,
        isActive: sup.isActive,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /admin/supervisors/:id/reports?period=daily|weekly|monthly
 * Returns:
 *   {
 *     supervisorId, period, totalDispatches, successCount, failureCount,
 *     breakdown: [{ date: "YYYY-MM-DD", sent: number, failed: number }]
 *   }
 *
 * The breakdown is zero-filled across the whole period so the chart on the
 * dashboard renders a continuous timeline (no gaps on days with 0 dispatches).
 */
export const getReports: RequestHandler = async (req, res, next) => {
  try {
    const id = param(req.params.id);
    const { period } = reportsQuerySchema.parse(req.query);

    const supervisor = await prisma.supervisor.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!supervisor) throw new NotFoundError('Supervisor', 'المشرف غير موجود');

    // Window in days, ending at "today" inclusive. The query window starts
    // at 00:00 (server local) so a "daily" report covers just today.
    const days = period === 'daily' ? 1 : period === 'weekly' ? 7 : 30;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - (days - 1));

    const dispatches = await prisma.supervisorOrderDispatch.findMany({
      where: {
        supervisorId: id,
        createdAt: { gte: start },
      },
      select: { createdAt: true, status: true },
    });

    // Bucket by YYYY-MM-DD.
    const buckets = new Map<string, { sent: number; failed: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      buckets.set(toYMD(d), { sent: 0, failed: 0 });
    }

    let successCount = 0;
    let failureCount = 0;
    for (const row of dispatches) {
      const key = toYMD(row.createdAt);
      const bucket = buckets.get(key);
      if (!bucket) continue; // ignore stray rows outside the window
      if (row.status === 'FAILED') {
        bucket.failed += 1;
        failureCount += 1;
      } else {
        bucket.sent += 1;
        successCount += 1;
      }
    }

    const breakdown = Array.from(buckets.entries()).map(([date, v]) => ({
      date,
      sent: v.sent,
      failed: v.failed,
    }));

    ok(res, {
      supervisorId: id,
      period,
      totalDispatches: successCount + failureCount,
      successCount,
      failureCount,
      breakdown,
    });
  } catch (err) {
    next(err);
  }
};

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
