import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { NotFoundError } from '../../utils/errors.js';
import { created, noContent, ok } from '../../utils/response.js';

const param = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new NotFoundError('Resource');
  return v;
};

const createSchema = z.object({
  title: z.string().trim().min(1).max(255),
  titleAr: z.string().trim().min(1).max(255),
  imageUrl: z.string().url(),
  linkType: z.enum(['SERVICE', 'MERCHANT', 'EXTERNAL', 'NONE']).default('NONE'),
  linkValue: z.string().max(500).optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
});

const updateSchema = createSchema.partial();

export const list: RequestHandler = async (_req, res, next) => {
  try {
    const offers = await prisma.offer.findMany({
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }],
    });
    ok(res, offers);
  } catch (err) {
    next(err);
  }
};

export const create: RequestHandler = async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const offer = await prisma.offer.create({ data: input });
    created(res, offer);
  } catch (err) {
    next(err);
  }
};

export const update: RequestHandler = async (req, res, next) => {
  try {
    const input = updateSchema.parse(req.body);
    const offer = await prisma.offer.update({
      where: { id: param(req.params.id) },
      data: input,
    });
    ok(res, offer);
  } catch (err) {
    next(err);
  }
};

export const remove: RequestHandler = async (req, res, next) => {
  try {
    await prisma.offer.delete({ where: { id: param(req.params.id) } });
    noContent(res);
  } catch (err) {
    next(err);
  }
};
