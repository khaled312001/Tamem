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
  id: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(1).max(120),
  nameAr: z.string().trim().min(1).max(120),
  iconUrl: z.string().url().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

const updateSchema = createSchema.partial().omit({ id: true });

export const list: RequestHandler = async (_req, res, next) => {
  try {
    const cats = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
    ok(res, cats);
  } catch (err) {
    next(err);
  }
};

export const create: RequestHandler = async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const cat = await prisma.category.create({ data: input });
    created(res, cat);
  } catch (err) {
    next(err);
  }
};

export const update: RequestHandler = async (req, res, next) => {
  try {
    const input = updateSchema.parse(req.body);
    const cat = await prisma.category.update({
      where: { id: param(req.params.id) },
      data: input,
    });
    ok(res, cat);
  } catch (err) {
    next(err);
  }
};

export const remove: RequestHandler = async (req, res, next) => {
  try {
    await prisma.category.update({
      where: { id: param(req.params.id) },
      data: { isActive: false },
    });
    noContent(res);
  } catch (err) {
    next(err);
  }
};
