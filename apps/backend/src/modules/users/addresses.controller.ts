import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { NotFoundError, UnauthorizedError } from '../../utils/errors.js';
import { created, noContent, ok } from '../../utils/response.js';

const param = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new NotFoundError('Resource');
  return v;
};

const upsertSchema = z.object({
  label: z.string().trim().min(1).max(60),
  address: z.string().trim().min(2).max(500),
  lat: z.number().optional(),
  lng: z.number().optional(),
  notes: z.string().max(500).optional(),
  isDefault: z.boolean().optional(),
});

export const listAddresses: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const addresses = await prisma.customerAddress.findMany({
      where: { userId: req.user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    ok(res, addresses);
  } catch (err) {
    next(err);
  }
};

export const createAddress: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const input = upsertSchema.parse(req.body);

    // If isDefault is requested, demote any existing default in a transaction
    // so we don't end up with two default addresses for the same user. Also,
    // if this is the customer's first saved address ever, force it to be the
    // default — order creation depends on having one, and silently leaving
    // a brand-new customer with zero defaults would just push the problem
    // into checkout.
    const result = await prisma.$transaction(async (tx) => {
      const existingCount = await tx.customerAddress.count({
        where: { userId: req.user!.id },
      });
      const shouldDefault = input.isDefault || existingCount === 0;

      if (shouldDefault) {
        await tx.customerAddress.updateMany({
          where: { userId: req.user!.id, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.customerAddress.create({
        data: {
          userId: req.user!.id,
          label: input.label,
          address: input.address,
          lat: input.lat,
          lng: input.lng,
          notes: input.notes,
          isDefault: shouldDefault,
        },
      });
    });
    created(res, result);
  } catch (err) {
    next(err);
  }
};

/**
 * Promote one address to be the user's default. Idempotent — re-firing on
 * an already-default address is a no-op.
 */
export const setDefaultAddress: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const id = param(req.params.id);
    const existing = await prisma.customerAddress.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.user.id) {
      throw new NotFoundError('Address', 'العنوان غير موجود');
    }
    const updated = await prisma.$transaction(async (tx) => {
      await tx.customerAddress.updateMany({
        where: { userId: req.user!.id, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
      return tx.customerAddress.update({
        where: { id },
        data: { isDefault: true },
      });
    });
    ok(res, updated);
  } catch (err) {
    next(err);
  }
};

export const updateAddress: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const id = param(req.params.id);
    const input = upsertSchema.partial().parse(req.body);
    const existing = await prisma.customerAddress.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.user.id) {
      throw new NotFoundError('Address', 'العنوان غير موجود');
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.customerAddress.updateMany({
          where: { userId: req.user!.id, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        });
      }
      return tx.customerAddress.update({ where: { id }, data: input });
    });
    ok(res, updated);
  } catch (err) {
    next(err);
  }
};

export const deleteAddress: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const id = param(req.params.id);
    const existing = await prisma.customerAddress.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.user.id) {
      throw new NotFoundError('Address', 'العنوان غير موجود');
    }

    // If we're about to delete the default, the customer would be left
    // without one — and the order-creation guard would block them next time.
    // Auto-promote the next most-recent address so the experience stays
    // smooth without forcing the customer to remember to flag a new default.
    await prisma.$transaction(async (tx) => {
      await tx.customerAddress.delete({ where: { id } });
      if (existing.isDefault) {
        const next = await tx.customerAddress.findFirst({
          where: { userId: req.user!.id },
          orderBy: { createdAt: 'desc' },
        });
        if (next) {
          await tx.customerAddress.update({
            where: { id: next.id },
            data: { isDefault: true },
          });
        }
      }
    });
    noContent(res);
  } catch (err) {
    next(err);
  }
};
