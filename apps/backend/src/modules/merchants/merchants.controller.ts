import bcrypt from 'bcryptjs';
import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { ConflictError, NotFoundError } from '../../utils/errors.js';
import { created, noContent, ok, paginated } from '../../utils/response.js';

const param = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new NotFoundError('Resource');
  return v;
};

const openHourSchema = z.object({
  day: z.enum(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']),
  from: z.string().regex(/^\d{2}:\d{2}$/),
  to: z.string().regex(/^\d{2}:\d{2}$/),
});

const createMerchantSchema = z.object({
  ownerName: z.string().trim().min(2).max(100),
  phone: z
    .string()
    .trim()
    .regex(/^\+?\d{8,15}$/),
  password: z.string().min(6).max(100),
  storeName: z.string().trim().min(2).max(120),
  storeNameAr: z.string().trim().min(2).max(120),
  categoryId: z.string(),
  description: z.string().max(2000).optional(),
  logoUrl: z.string().url().optional(),
  coverUrl: z.string().url().optional(),
  addressLine: z.string().trim().min(2).max(500),
  lat: z.number(),
  lng: z.number(),
  governorate: z.string().min(1).max(100),
  city: z.string().min(1).max(100),
  openHours: z.array(openHourSchema).optional(),
});

const updateMerchantSchema = createMerchantSchema
  .omit({ phone: true, password: true })
  .partial()
  .extend({
    isOpen: z.boolean().optional(),
    isActive: z.boolean().optional(),
  });

const listQuerySchema = z.object({
  categoryId: z.string().optional(),
  governorate: z.string().optional(),
  city: z.string().optional(),
  search: z.string().optional(),
  isOpen: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

export const list: RequestHandler = async (req, res, next) => {
  try {
    const q = listQuerySchema.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.governorate) where.governorate = q.governorate;
    if (q.city) where.city = q.city;
    if (q.isOpen !== undefined) where.isOpen = q.isOpen;
    if (q.search) {
      where.OR = [{ storeName: { contains: q.search } }, { storeNameAr: { contains: q.search } }];
    }

    const [items, total] = await Promise.all([
      prisma.merchantProfile.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, phone: true } },
          category: { select: { id: true, name: true, nameAr: true } },
          _count: { select: { products: true } },
        },
      }),
      prisma.merchantProfile.count({ where }),
    ]);
    paginated(res, items, { page: q.page, pageSize: q.pageSize, total });
  } catch (err) {
    next(err);
  }
};

export const get: RequestHandler = async (req, res, next) => {
  try {
    const merchant = await prisma.merchantProfile.findUnique({
      where: { id: param(req.params.id) },
      include: {
        user: { select: { id: true, name: true, phone: true, isActive: true } },
        category: true,
        products: true,
      },
    });
    if (!merchant) throw new NotFoundError('Merchant', 'المتجر غير موجود');
    ok(res, merchant);
  } catch (err) {
    next(err);
  }
};

export const create: RequestHandler = async (req, res, next) => {
  try {
    const input = createMerchantSchema.parse(req.body);
    const existingPhone = await prisma.user.findUnique({ where: { phone: input.phone } });
    if (existingPhone) {
      throw new ConflictError('Phone already used', 'هذا الرقم مسجل بالفعل');
    }
    const passwordHash = await bcrypt.hash(input.password, 12);
    const created2 = await prisma.user.create({
      data: {
        phone: input.phone,
        name: input.ownerName,
        passwordHash,
        role: 'MERCHANT',
        isPhoneVerified: true,
        isActive: true,
        governorate: input.governorate,
        city: input.city,
        merchantProfile: {
          create: {
            storeName: input.storeName,
            storeNameAr: input.storeNameAr,
            categoryId: input.categoryId,
            description: input.description,
            logoUrl: input.logoUrl,
            coverUrl: input.coverUrl,
            addressLine: input.addressLine,
            lat: input.lat,
            lng: input.lng,
            governorate: input.governorate,
            city: input.city,
            openHours: input.openHours,
            isOpen: true,
          },
        },
      },
      include: { merchantProfile: true },
    });
    created(res, created2);
  } catch (err) {
    next(err);
  }
};

export const update: RequestHandler = async (req, res, next) => {
  try {
    const input = updateMerchantSchema.parse(req.body);
    const merchantId = param(req.params.id);
    const merchant = await prisma.merchantProfile.findUnique({ where: { id: merchantId } });
    if (!merchant) throw new NotFoundError('Merchant', 'المتجر غير موجود');

    const profileData: Record<string, unknown> = {};
    for (const k of [
      'storeName',
      'storeNameAr',
      'categoryId',
      'description',
      'logoUrl',
      'coverUrl',
      'addressLine',
      'lat',
      'lng',
      'governorate',
      'city',
      'openHours',
      'isOpen',
    ] as const) {
      if (input[k] !== undefined) profileData[k] = input[k];
    }

    const updated = await prisma.merchantProfile.update({
      where: { id: merchantId },
      data: profileData,
      include: {
        user: { select: { id: true, name: true, phone: true } },
        category: true,
      },
    });

    if (input.ownerName || typeof input.isActive === 'boolean') {
      await prisma.user.update({
        where: { id: merchant.userId },
        data: {
          ...(input.ownerName ? { name: input.ownerName } : {}),
          ...(typeof input.isActive === 'boolean' ? { isActive: input.isActive } : {}),
        },
      });
    }
    ok(res, updated);
  } catch (err) {
    next(err);
  }
};

export const remove: RequestHandler = async (req, res, next) => {
  try {
    const merchantId = param(req.params.id);
    const merchant = await prisma.merchantProfile.findUnique({ where: { id: merchantId } });
    if (!merchant) throw new NotFoundError('Merchant', 'المتجر غير موجود');
    await prisma.user.update({ where: { id: merchant.userId }, data: { isActive: false } });
    noContent(res);
  } catch (err) {
    next(err);
  }
};
