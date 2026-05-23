import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { NotFoundError } from '../../utils/errors.js';
import { created, noContent, ok } from '../../utils/response.js';

const param = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new NotFoundError('Resource');
  return v;
};

const ruleSchema = z.object({
  serviceId: z.string(),
  governorate: z.string().optional(),
  city: z.string().optional(),
  basePrice: z.number().nonnegative().default(0),
  pricePerKm: z.number().nonnegative().default(0),
  pricePerKg: z.number().nonnegative().default(0),
  minPrice: z.number().nonnegative().default(0),
  maxPrice: z.number().nonnegative().optional(),
  fragileSurcharge: z.number().nonnegative().default(0),
  expressSurcharge: z.number().nonnegative().default(0),
  weekendMultiplier: z.number().positive().optional(),
  nightMultiplier: z.number().positive().optional(),
  nightStartHour: z.number().int().min(0).max(23).optional(),
  nightEndHour: z.number().int().min(0).max(23).optional(),
  isActive: z.boolean().default(true),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().optional(),
});

const updateRuleSchema = ruleSchema.partial().omit({ serviceId: true });

export const list: RequestHandler = async (req, res, next) => {
  try {
    const { serviceId } = z.object({ serviceId: z.string().optional() }).parse(req.query);
    const where = serviceId ? { serviceId } : {};
    const rules = await prisma.pricingRule.findMany({
      where,
      orderBy: [{ serviceId: 'asc' }, { governorate: 'asc' }],
      include: { service: { select: { id: true, nameAr: true } } },
    });
    ok(res, rules);
  } catch (err) {
    next(err);
  }
};

export const create: RequestHandler = async (req, res, next) => {
  try {
    const input = ruleSchema.parse(req.body);
    const rule = await prisma.pricingRule.create({ data: input });
    created(res, rule);
  } catch (err) {
    next(err);
  }
};

export const update: RequestHandler = async (req, res, next) => {
  try {
    const input = updateRuleSchema.parse(req.body);
    const rule = await prisma.pricingRule.update({
      where: { id: param(req.params.id) },
      data: input,
    });
    ok(res, rule);
  } catch (err) {
    next(err);
  }
};

export const remove: RequestHandler = async (req, res, next) => {
  try {
    await prisma.pricingRule.delete({ where: { id: param(req.params.id) } });
    noContent(res);
  } catch (err) {
    next(err);
  }
};
