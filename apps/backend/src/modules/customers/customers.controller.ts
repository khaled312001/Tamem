/**
 * Admin endpoints for managing customers — list / get / update profile /
 * manage saved addresses + secondary phones. Phone uniqueness is enforced
 * by the DB; we surface a clear Arabic error when a duplicate is rejected.
 */
import type { RequestHandler } from 'express';
import { z } from 'zod';

import { queryBool } from '../../utils/zodBool.js';

import { phoneSchema } from '@tamem/validators';

import { prisma } from '../../db/prisma.js';
import { ConflictError, NotFoundError } from '../../utils/errors.js';
import { ok, paginated } from '../../utils/response.js';

const param = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new NotFoundError('Resource');
  return v;
};

const listQuerySchema = z.object({
  search: z.string().optional(),
  governorate: z.string().optional(),
  city: z.string().optional(),
  isActive: queryBool.optional(),
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
        secondaryPhones: true,
        isActive: true,
        createdAt: true,
        savedAddresses: {
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
          select: {
            id: true,
            label: true,
            address: true,
            lat: true,
            lng: true,
            notes: true,
            isDefault: true,
          },
        },
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

// ── Update profile ─────────────────────────────────────────────────────
const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: phoneSchema.optional(),
  email: z.string().trim().email().max(255).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  governorate: z.string().trim().max(100).optional().nullable(),
  defaultAddress: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
  // Up to 3 secondary phones — kept short so the UI stays simple.
  secondaryPhones: z.array(phoneSchema).max(3).optional(),
});

export const update: RequestHandler = async (req, res, next) => {
  try {
    const id = param(req.params.id);
    const input = updateSchema.parse(req.body);

    const existing = await prisma.user.findFirst({
      where: { id, role: 'CUSTOMER' },
      select: { id: true, phone: true },
    });
    if (!existing) throw new NotFoundError('Customer', 'العميل غير موجود');

    // Pre-check phone uniqueness so the error is clearly attributed.
    if (input.phone && input.phone !== existing.phone) {
      const clash = await prisma.user.findUnique({
        where: { phone: input.phone },
        select: { id: true },
      });
      if (clash && clash.id !== id) {
        throw new ConflictError('PHONE_TAKEN', 'هذا الرقم مسجّل لمستخدم آخر');
      }
    }

    const data: Record<string, unknown> = { ...input };
    // Strip undefined so Prisma doesn't try to set them to null.
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        city: true,
        governorate: true,
        defaultAddress: true,
        secondaryPhones: true,
        isActive: true,
      },
    });
    ok(res, updated);
  } catch (err) {
    next(err);
  }
};

// ── Address CRUD ───────────────────────────────────────────────────────
const addressSchema = z.object({
  label: z.string().trim().min(1).max(60),
  address: z.string().trim().min(3).max(500),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  isDefault: z.boolean().optional(),
});

async function assertCustomer(id: string): Promise<void> {
  const c = await prisma.user.findFirst({ where: { id, role: 'CUSTOMER' }, select: { id: true } });
  if (!c) throw new NotFoundError('Customer', 'العميل غير موجود');
}

export const addAddress: RequestHandler = async (req, res, next) => {
  try {
    const userId = param(req.params.id);
    await assertCustomer(userId);
    const input = addressSchema.parse(req.body);

    // If marked default, unset any previous default first.
    if (input.isDefault) {
      await prisma.customerAddress.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }
    const created = await prisma.customerAddress.create({
      data: { userId, ...input, isDefault: input.isDefault ?? false },
    });
    ok(res, created);
  } catch (err) {
    next(err);
  }
};

export const updateAddress: RequestHandler = async (req, res, next) => {
  try {
    const userId = param(req.params.id);
    const addressId = param(req.params.addressId);
    await assertCustomer(userId);
    const input = addressSchema.partial().parse(req.body);

    const existing = await prisma.customerAddress.findFirst({
      where: { id: addressId, userId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError('Address', 'العنوان غير موجود');

    if (input.isDefault) {
      await prisma.customerAddress.updateMany({
        where: { userId, isDefault: true, NOT: { id: addressId } },
        data: { isDefault: false },
      });
    }
    const updated = await prisma.customerAddress.update({
      where: { id: addressId },
      data: input,
    });
    ok(res, updated);
  } catch (err) {
    next(err);
  }
};

export const deleteAddress: RequestHandler = async (req, res, next) => {
  try {
    const userId = param(req.params.id);
    const addressId = param(req.params.addressId);
    await assertCustomer(userId);
    const existing = await prisma.customerAddress.findFirst({
      where: { id: addressId, userId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError('Address', 'العنوان غير موجود');
    await prisma.customerAddress.delete({ where: { id: addressId } });
    ok(res, { id: addressId, deleted: true });
  } catch (err) {
    next(err);
  }
};
