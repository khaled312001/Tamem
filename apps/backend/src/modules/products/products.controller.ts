import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { NotFoundError } from '../../utils/errors.js';
import { created, noContent, ok, paginated } from '../../utils/response.js';

const param = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new NotFoundError('Resource');
  return v;
};

const createSchema = z.object({
  merchantId: z.string(),
  name: z.string().trim().min(1).max(255),
  nameAr: z.string().trim().min(1).max(255),
  description: z.string().max(2000).optional(),
  imageUrl: z.string().url().optional(),
  price: z.number().nonnegative(),
  unit: z.string().max(50).optional(),
  isAvailable: z.boolean().default(true),
  stock: z.number().int().nonnegative().optional(),
  sortOrder: z.number().int().default(0),
});

const updateSchema = createSchema.partial().omit({ merchantId: true });

const listQuerySchema = z.object({
  merchantId: z.string().optional(),
  search: z.string().optional(),
  isAvailable: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

const bulkSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  isAvailable: z.boolean(),
});

export const list: RequestHandler = async (req, res, next) => {
  try {
    const q = listQuerySchema.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.merchantId) where.merchantId = q.merchantId;
    if (q.isAvailable !== undefined) where.isAvailable = q.isAvailable;
    if (q.search) {
      where.OR = [{ name: { contains: q.search } }, { nameAr: { contains: q.search } }];
    }
    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: [{ merchantId: 'asc' }, { sortOrder: 'asc' }],
        include: { merchant: { select: { id: true, storeNameAr: true } } },
      }),
      prisma.product.count({ where }),
    ]);
    paginated(res, items, { page: q.page, pageSize: q.pageSize, total });
  } catch (err) {
    next(err);
  }
};

export const create: RequestHandler = async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const product = await prisma.product.create({ data: input });
    created(res, product);
  } catch (err) {
    next(err);
  }
};

export const update: RequestHandler = async (req, res, next) => {
  try {
    const input = updateSchema.parse(req.body);
    const product = await prisma.product.update({
      where: { id: param(req.params.id) },
      data: input,
    });
    ok(res, product);
  } catch (err) {
    next(err);
  }
};

export const remove: RequestHandler = async (req, res, next) => {
  try {
    await prisma.product.update({
      where: { id: param(req.params.id) },
      data: { isAvailable: false },
    });
    noContent(res);
  } catch (err) {
    next(err);
  }
};

export const bulkAvailability: RequestHandler = async (req, res, next) => {
  try {
    const input = bulkSchema.parse(req.body);
    const result = await prisma.product.updateMany({
      where: { id: { in: input.ids } },
      data: { isAvailable: input.isAvailable },
    });
    ok(res, { updated: result.count });
  } catch (err) {
    next(err);
  }
};
