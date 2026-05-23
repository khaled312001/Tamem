import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { NotFoundError } from '../../utils/errors.js';
import { ok } from '../../utils/response.js';

const upsertSchema = z.object({
  value: z.unknown(),
  description: z.string().max(500).optional(),
});

const bulkSchema = z.object({
  items: z.array(
    z.object({
      key: z.string().min(1),
      value: z.unknown(),
      description: z.string().max(500).optional(),
    }),
  ),
});

export const list: RequestHandler = async (_req, res, next) => {
  try {
    const settings = await prisma.setting.findMany({ orderBy: { key: 'asc' } });
    ok(res, settings);
  } catch (err) {
    next(err);
  }
};

export const get: RequestHandler = async (req, res, next) => {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: String(req.params.key) } });
    if (!setting) throw new NotFoundError('Setting', 'الإعداد غير موجود');
    ok(res, setting);
  } catch (err) {
    next(err);
  }
};

export const upsert: RequestHandler = async (req, res, next) => {
  try {
    const key = String(req.params.key);
    const input = upsertSchema.parse(req.body);
    const setting = await prisma.setting.upsert({
      where: { key },
      update: {
        value: input.value as object,
        description: input.description,
        updatedById: req.user!.id,
      },
      create: {
        key,
        value: input.value as object,
        description: input.description,
        updatedById: req.user!.id,
      },
    });
    ok(res, setting);
  } catch (err) {
    next(err);
  }
};

export const bulk: RequestHandler = async (req, res, next) => {
  try {
    const input = bulkSchema.parse(req.body);
    const tx = await prisma.$transaction(
      input.items.map((it) =>
        prisma.setting.upsert({
          where: { key: it.key },
          update: {
            value: it.value as object,
            description: it.description,
            updatedById: req.user!.id,
          },
          create: {
            key: it.key,
            value: it.value as object,
            description: it.description,
            updatedById: req.user!.id,
          },
        }),
      ),
    );
    ok(res, tx);
  } catch (err) {
    next(err);
  }
};
