import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { NotFoundError } from '../../utils/errors.js';
import { ok, paginated } from '../../utils/response.js';

const param = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new NotFoundError('Resource');
  return v;
};

const listQuerySchema = z.object({
  search: z.string().optional(),
  governorate: z.string().optional(),
  city: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

export const list: RequestHandler = async (req, res, next) => {
  try {
    const q = listQuerySchema.parse(req.query);
    const where: Record<string, unknown> = { role: 'CUSTOMER' };
    if (q.governorate) where.governorate = q.governorate;
    if (q.city) where.city = q.city;
    if (q.isActive !== undefined) where.isActive = q.isActive;
    if (q.search) {
      where.OR = [{ name: { contains: q.search } }, { phone: { contains: q.search } }];
    }

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          city: true,
          governorate: true,
          isActive: true,
          createdAt: true,
          _count: { select: { customerOrders: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);
    paginated(res, items, { page: q.page, pageSize: q.pageSize, total });
  } catch (err) {
    next(err);
  }
};

export const get: RequestHandler = async (req, res, next) => {
  try {
    const customer = await prisma.user.findFirst({
      where: { id: param(req.params.id), role: 'CUSTOMER' },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        city: true,
        governorate: true,
        defaultAddress: true,
        isActive: true,
        createdAt: true,
        customerOrders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            orderNumber: true,
            status: true,
            category: true,
            quotedPrice: true,
            finalPrice: true,
            createdAt: true,
          },
        },
      },
    });
    if (!customer) throw new NotFoundError('Customer', 'العميل غير موجود');
    ok(res, customer);
  } catch (err) {
    next(err);
  }
};
