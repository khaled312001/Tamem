import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { NotFoundError } from '../../utils/errors.js';
import { ok } from '../../utils/response.js';

const param = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new NotFoundError('Resource');
  return v;
};

// z.coerce.boolean() runs Boolean(value), which makes "false" → true (non-empty
// string is truthy). Parse it ourselves so the dashboard can pass the literal
// string "false" via URL query and have it actually filter out resolved alerts.
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

const listQuery = z.object({
  resolved: boolFromQuery,
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  type: z
    .enum([
      'PENDING_ORDER',
      'DRIVER_NOT_RESPONDING',
      'CASH_LIMIT_EXCEEDED',
      'COMPLAINT',
      'PAYMENT_PENDING',
    ])
    .optional(),
});

const resolveSchema = z.object({
  note: z.string().trim().min(1).max(500),
});

export const list: RequestHandler = async (req, res, next) => {
  try {
    const q = listQuery.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.resolved !== undefined) where.isResolved = q.resolved;
    if (q.severity) where.severity = q.severity;
    if (q.type) where.type = q.type;

    const alerts = await prisma.alert.findMany({
      where,
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      include: {
        relatedOrder: {
          select: { id: true, orderNumber: true, status: true },
        },
        resolvedBy: { select: { id: true, name: true } },
      },
      take: 200,
    });

    const stats = {
      critical: alerts.filter((a) => !a.isResolved && a.severity === 'CRITICAL').length,
      high: alerts.filter((a) => !a.isResolved && a.severity === 'HIGH').length,
      medium: alerts.filter((a) => !a.isResolved && a.severity === 'MEDIUM').length,
      low: alerts.filter((a) => !a.isResolved && a.severity === 'LOW').length,
      resolvedToday: alerts.filter(
        (a) =>
          a.isResolved && a.resolvedAt && a.resolvedAt.toDateString() === new Date().toDateString(),
      ).length,
    };

    ok(res, alerts, { stats });
  } catch (err) {
    next(err);
  }
};

export const resolve: RequestHandler = async (req, res, next) => {
  try {
    const input = resolveSchema.parse(req.body);
    const alert = await prisma.alert.update({
      where: { id: param(req.params.id) },
      data: {
        isResolved: true,
        resolvedById: req.user!.id,
        resolvedAt: new Date(),
        resolutionNotes: input.note,
      },
    });
    ok(res, alert);
  } catch (err) {
    next(err);
  }
};
