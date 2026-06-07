/**
 * Admin/merchant CRUD for the per-weekday opening windows + manual status
 * override. The merchant manages this from the dashboard; the mobile reads
 * the resolved openness from the public catalog endpoint.
 */
import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { NotFoundError } from '../../utils/errors.js';
import { ok } from '../../utils/response.js';

import { getMerchantOpenness } from './merchantHours.js';

const param = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new NotFoundError('Resource');
  return v;
};

const windowSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  openMin: z.number().int().min(0).max(2879), // up to 48h to allow after-midnight
  closeMin: z.number().int().min(1).max(2880),
  isClosed: z.boolean().default(false),
});

const setHoursSchema = z.object({
  windows: z.array(windowSchema).max(50),
});

const statusSchema = z.object({
  manualStatus: z.enum(['OPEN', 'CLOSED', 'TEMPORARILY_CLOSED']),
});

/** GET /admin/merchants/:id/hours — current windows + resolved openness. */
export const listHours: RequestHandler = async (req, res, next) => {
  try {
    const merchantId = param(req.params.id);
    const merchant = await prisma.merchantProfile.findUnique({
      where: { id: merchantId },
      select: { id: true, storeNameAr: true, manualStatus: true, timezone: true },
    });
    if (!merchant) throw new NotFoundError('Merchant');
    const windows = await prisma.merchantBusinessHours.findMany({
      where: { merchantId },
      orderBy: [{ dayOfWeek: 'asc' }, { openMin: 'asc' }],
    });
    const openness = await getMerchantOpenness(merchantId);
    ok(res, { merchant, windows, openness });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /admin/merchants/:id/hours — replace the entire weekly schedule.
 * We wipe + insert in a transaction so admins don't have to diff rows in
 * the UI. Idempotent: posting the same body twice leaves the DB identical.
 */
export const setHours: RequestHandler = async (req, res, next) => {
  try {
    const merchantId = param(req.params.id);
    const input = setHoursSchema.parse(req.body);
    const merchant = await prisma.merchantProfile.findUnique({ where: { id: merchantId } });
    if (!merchant) throw new NotFoundError('Merchant');

    await prisma.$transaction([
      prisma.merchantBusinessHours.deleteMany({ where: { merchantId } }),
      prisma.merchantBusinessHours.createMany({
        data: input.windows.map((w) => ({
          merchantId,
          dayOfWeek: w.dayOfWeek,
          openMin: w.openMin,
          closeMin: w.closeMin,
          isClosed: w.isClosed,
        })),
      }),
    ]);

    const windows = await prisma.merchantBusinessHours.findMany({
      where: { merchantId },
      orderBy: [{ dayOfWeek: 'asc' }, { openMin: 'asc' }],
    });
    const openness = await getMerchantOpenness(merchantId);
    ok(res, { windows, openness });
  } catch (err) {
    next(err);
  }
};

/** PATCH /admin/merchants/:id/status — set the manual status override. */
export const setStatus: RequestHandler = async (req, res, next) => {
  try {
    const merchantId = param(req.params.id);
    const input = statusSchema.parse(req.body);
    await prisma.merchantProfile.update({
      where: { id: merchantId },
      data: {
        manualStatus: input.manualStatus,
        // Keep the legacy `isOpen` boolean in sync so older code paths
        // that read it still get a sensible answer.
        isOpen: input.manualStatus === 'OPEN',
      },
    });
    const openness = await getMerchantOpenness(merchantId);
    ok(res, { manualStatus: input.manualStatus, openness });
  } catch (err) {
    next(err);
  }
};
