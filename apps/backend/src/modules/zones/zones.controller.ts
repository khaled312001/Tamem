import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { BadRequestError, NotFoundError } from '../../utils/errors.js';
import { ok, paginated } from '../../utils/response.js';

import { getDeliveryPriceFor } from './zones.service.js';

const param = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new NotFoundError('Resource');
  return v;
};

const paginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
});

const publicPaginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(100),
});

// Decimal-friendly numeric validator. Accepts numbers and numeric strings so
// the JSON body can use either (mobile picker sends Number; admin form may
// keep precision as a string). Rejects negatives and NaN.
const priceField = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === 'string' ? Number(v) : v))
  .refine((n) => Number.isFinite(n) && n >= 0, { message: 'Invalid price' });

const optionalPriceField = priceField.optional().nullable();

const cityCreateSchema = z.object({
  nameAr: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().min(1).max(120).optional(),
});

const cityUpdateSchema = z.object({
  nameAr: z.string().trim().min(1).max(120).optional(),
  nameEn: z.string().trim().min(1).max(120).nullable().optional(),
  isActive: z.boolean().optional(),
});

const villageCreateSchema = z.object({
  cityId: z.string().min(1),
  nameAr: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().min(1).max(120).optional(),
  baseDeliveryPrice: optionalPriceField,
});

const villageUpdateSchema = z.object({
  nameAr: z.string().trim().min(1).max(120).optional(),
  nameEn: z.string().trim().min(1).max(120).nullable().optional(),
  baseDeliveryPrice: optionalPriceField,
  isActive: z.boolean().optional(),
});

const areaCreateSchema = z.object({
  villageId: z.string().min(1),
  nameAr: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().min(1).max(120).optional(),
  deliveryPrice: optionalPriceField,
});

const areaUpdateSchema = z.object({
  nameAr: z.string().trim().min(1).max(120).optional(),
  nameEn: z.string().trim().min(1).max(120).nullable().optional(),
  deliveryPrice: optionalPriceField,
  isActive: z.boolean().optional(),
});

const quoteDeliverySchema = z.object({
  cityId: z.string().min(1),
  villageId: z.string().min(1),
  areaId: z.string().min(1),
});

// =============================================================================
// Public — used by the mobile address picker (no auth)
// =============================================================================

/** GET /zones/cities — active cities for the picker. */
export const publicListCities: RequestHandler = async (_req, res, next) => {
  try {
    const cities = await prisma.city.findMany({
      where: { isActive: true },
      orderBy: { nameAr: 'asc' },
      select: { id: true, nameAr: true, nameEn: true },
    });
    ok(res, cities);
  } catch (err) {
    next(err);
  }
};

/** GET /zones/cities/:id/villages — active villages of a city. */
export const publicListVillages: RequestHandler = async (req, res, next) => {
  try {
    const cityId = param(req.params.id);
    const q = publicPaginationQuery.parse(req.query);
    const where = { cityId, isActive: true };
    const [items, total] = await Promise.all([
      prisma.village.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { nameAr: 'asc' },
        select: { id: true, nameAr: true, nameEn: true, baseDeliveryPrice: true },
      }),
      prisma.village.count({ where }),
    ]);
    paginated(res, items, { page: q.page, pageSize: q.pageSize, total });
  } catch (err) {
    next(err);
  }
};

/** GET /zones/villages/:id/areas — active areas of a village. */
export const publicListAreas: RequestHandler = async (req, res, next) => {
  try {
    const villageId = param(req.params.id);
    const q = publicPaginationQuery.parse(req.query);
    const where = { villageId, isActive: true };
    const [items, total] = await Promise.all([
      prisma.area.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { nameAr: 'asc' },
        select: { id: true, nameAr: true, nameEn: true, deliveryPrice: true },
      }),
      prisma.area.count({ where }),
    ]);
    paginated(res, items, { page: q.page, pageSize: q.pageSize, total });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /zones/quote-delivery — preview the resolved delivery fee for a
 * (city, village, area) triple. Unauthenticated by design (the address
 * picker calls this before login is required for the order create flow).
 * The mobile shows the result as advisory; the authoritative recompute
 * runs server-side in orders.customer.controller.ts.
 */
export const publicQuoteDelivery: RequestHandler = async (req, res, next) => {
  try {
    const input = quoteDeliverySchema.parse(req.body);
    const result = await getDeliveryPriceFor(input);
    if (!result.ok) {
      if (result.error === 'INVALID_HIERARCHY') {
        throw new BadRequestError('INVALID_ZONE', 'اختيارات العنوان غير صحيحة');
      }
      if (result.error === 'INACTIVE_ZONE') {
        throw new BadRequestError(
          'INACTIVE_ZONE',
          'هذه المنطقة غير مفعّلة حالياً. اختر منطقة أخرى.',
        );
      }
      throw new BadRequestError(
        'NO_DELIVERY_PRICE',
        'لا يوجد سعر توصيل لهذه المنطقة. تواصل مع الإدارة لإضافة السعر.',
      );
    }
    ok(res, {
      price: result.value.price,
      source: result.value.source,
      cityName: result.value.cityName,
      villageName: result.value.villageName,
      areaName: result.value.areaName,
    });
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// Admin — full CRUD over the zone hierarchy
// =============================================================================

// ----- Cities -----

/**
 * GET /admin/zones/cities — list cities (active + inactive) with counts of
 * active villages and areas. The areaCount aggregates across the city's
 * villages so the dashboard can show "X villages, Y areas" badges.
 */
export const adminListCities: RequestHandler = async (req, res, next) => {
  try {
    const q = paginationQuery.parse(req.query);
    const [cities, total] = await Promise.all([
      prisma.city.findMany({
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: [{ isActive: 'desc' }, { nameAr: 'asc' }],
        include: {
          _count: { select: { villages: { where: { isActive: true } } } },
        },
      }),
      prisma.city.count(),
    ]);

    // Area counts must aggregate through villages. One groupBy keeps it O(1)
    // round-trips rather than N+1 per city.
    const cityIds = cities.map((c) => c.id);
    let areaCountByCity: Record<string, number> = {};
    if (cityIds.length > 0) {
      const villageRows = await prisma.village.findMany({
        where: { cityId: { in: cityIds }, isActive: true },
        select: {
          cityId: true,
          _count: { select: { areas: { where: { isActive: true } } } },
        },
      });
      areaCountByCity = villageRows.reduce<Record<string, number>>((acc, v) => {
        acc[v.cityId] = (acc[v.cityId] ?? 0) + v._count.areas;
        return acc;
      }, {});
    }

    const data = cities.map((c) => ({
      id: c.id,
      nameAr: c.nameAr,
      nameEn: c.nameEn,
      villageCount: c._count.villages,
      areaCount: areaCountByCity[c.id] ?? 0,
      isActive: c.isActive,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    paginated(res, data, { page: q.page, pageSize: q.pageSize, total });
  } catch (err) {
    next(err);
  }
};

export const adminCreateCity: RequestHandler = async (req, res, next) => {
  try {
    const input = cityCreateSchema.parse(req.body);
    // Soft-revive: if a city with this nameAr already exists (active or not),
    // reuse it rather than crashing on the unique constraint. Admins commonly
    // re-add a deleted city; we restore + update names in one go.
    const existing = await prisma.city.findUnique({ where: { nameAr: input.nameAr } });
    const city = existing
      ? await prisma.city.update({
          where: { id: existing.id },
          data: { nameEn: input.nameEn ?? existing.nameEn, isActive: true },
        })
      : await prisma.city.create({
          data: { nameAr: input.nameAr, nameEn: input.nameEn, isActive: true },
        });
    ok(res, city);
  } catch (err) {
    next(err);
  }
};

export const adminUpdateCity: RequestHandler = async (req, res, next) => {
  try {
    const id = param(req.params.id);
    const input = cityUpdateSchema.parse(req.body);
    const exists = await prisma.city.findUnique({ where: { id } });
    if (!exists) throw new NotFoundError('City', 'المدينة غير موجودة');
    const city = await prisma.city.update({ where: { id }, data: input });
    ok(res, city);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /admin/zones/cities/:id — soft-delete a city and cascade to its
 * villages + areas (also soft-deleted). We never hard-delete because
 * historical Orders may reference these IDs for the accountant report.
 */
export const adminDeleteCity: RequestHandler = async (req, res, next) => {
  try {
    const id = param(req.params.id);
    const exists = await prisma.city.findUnique({ where: { id } });
    if (!exists) throw new NotFoundError('City', 'المدينة غير موجودة');

    await prisma.$transaction(async (tx) => {
      await tx.city.update({ where: { id }, data: { isActive: false } });
      const villages = await tx.village.findMany({
        where: { cityId: id },
        select: { id: true },
      });
      const villageIds = villages.map((v) => v.id);
      if (villageIds.length > 0) {
        await tx.village.updateMany({
          where: { id: { in: villageIds } },
          data: { isActive: false },
        });
        await tx.area.updateMany({
          where: { villageId: { in: villageIds } },
          data: { isActive: false },
        });
      }
    });

    ok(res, { id, isActive: false });
  } catch (err) {
    next(err);
  }
};

// ----- Villages -----

export const adminListVillages: RequestHandler = async (req, res, next) => {
  try {
    const cityId = param(req.params.cityId);
    const q = paginationQuery.parse(req.query);

    const cityExists = await prisma.city.findUnique({ where: { id: cityId } });
    if (!cityExists) throw new NotFoundError('City', 'المدينة غير موجودة');

    const where = { cityId };
    const [items, total] = await Promise.all([
      prisma.village.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: [{ isActive: 'desc' }, { nameAr: 'asc' }],
        include: {
          _count: { select: { areas: { where: { isActive: true } } } },
        },
      }),
      prisma.village.count({ where }),
    ]);

    const data = items.map((v) => ({
      id: v.id,
      cityId: v.cityId,
      nameAr: v.nameAr,
      nameEn: v.nameEn,
      baseDeliveryPrice: v.baseDeliveryPrice,
      areaCount: v._count.areas,
      isActive: v.isActive,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    }));

    paginated(res, data, { page: q.page, pageSize: q.pageSize, total });
  } catch (err) {
    next(err);
  }
};

export const adminCreateVillage: RequestHandler = async (req, res, next) => {
  try {
    const input = villageCreateSchema.parse(req.body);
    const city = await prisma.city.findUnique({ where: { id: input.cityId } });
    if (!city) throw new NotFoundError('City', 'المدينة غير موجودة');
    // Same soft-revive trick as cities — re-create on top of a soft-deleted
    // row instead of erroring out on the (cityId, nameAr) unique index.
    const existing = await prisma.village.findUnique({
      where: { cityId_nameAr: { cityId: input.cityId, nameAr: input.nameAr } },
    });
    const village = existing
      ? await prisma.village.update({
          where: { id: existing.id },
          data: {
            nameEn: input.nameEn ?? existing.nameEn,
            baseDeliveryPrice: input.baseDeliveryPrice ?? existing.baseDeliveryPrice,
            isActive: true,
          },
        })
      : await prisma.village.create({
          data: {
            cityId: input.cityId,
            nameAr: input.nameAr,
            nameEn: input.nameEn,
            baseDeliveryPrice: input.baseDeliveryPrice,
            isActive: true,
          },
        });
    ok(res, village);
  } catch (err) {
    next(err);
  }
};

export const adminUpdateVillage: RequestHandler = async (req, res, next) => {
  try {
    const id = param(req.params.id);
    const input = villageUpdateSchema.parse(req.body);
    const exists = await prisma.village.findUnique({ where: { id } });
    if (!exists) throw new NotFoundError('Village', 'القرية غير موجودة');
    const village = await prisma.village.update({ where: { id }, data: input });
    ok(res, village);
  } catch (err) {
    next(err);
  }
};

export const adminDeleteVillage: RequestHandler = async (req, res, next) => {
  try {
    const id = param(req.params.id);
    const exists = await prisma.village.findUnique({ where: { id } });
    if (!exists) throw new NotFoundError('Village', 'القرية غير موجودة');
    await prisma.$transaction(async (tx) => {
      await tx.village.update({ where: { id }, data: { isActive: false } });
      await tx.area.updateMany({ where: { villageId: id }, data: { isActive: false } });
    });
    ok(res, { id, isActive: false });
  } catch (err) {
    next(err);
  }
};

// ----- Areas -----

export const adminListAreas: RequestHandler = async (req, res, next) => {
  try {
    const villageId = param(req.params.villageId);
    const q = paginationQuery.parse(req.query);

    const villageExists = await prisma.village.findUnique({ where: { id: villageId } });
    if (!villageExists) throw new NotFoundError('Village', 'القرية غير موجودة');

    const where = { villageId };
    const [items, total] = await Promise.all([
      prisma.area.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: [{ isActive: 'desc' }, { nameAr: 'asc' }],
      }),
      prisma.area.count({ where }),
    ]);

    paginated(res, items, { page: q.page, pageSize: q.pageSize, total });
  } catch (err) {
    next(err);
  }
};

export const adminCreateArea: RequestHandler = async (req, res, next) => {
  try {
    const input = areaCreateSchema.parse(req.body);
    const village = await prisma.village.findUnique({ where: { id: input.villageId } });
    if (!village) throw new NotFoundError('Village', 'القرية غير موجودة');
    const existing = await prisma.area.findUnique({
      where: { villageId_nameAr: { villageId: input.villageId, nameAr: input.nameAr } },
    });
    const area = existing
      ? await prisma.area.update({
          where: { id: existing.id },
          data: {
            nameEn: input.nameEn ?? existing.nameEn,
            deliveryPrice: input.deliveryPrice ?? existing.deliveryPrice,
            isActive: true,
          },
        })
      : await prisma.area.create({
          data: {
            villageId: input.villageId,
            nameAr: input.nameAr,
            nameEn: input.nameEn,
            deliveryPrice: input.deliveryPrice,
            isActive: true,
          },
        });
    ok(res, area);
  } catch (err) {
    next(err);
  }
};

export const adminUpdateArea: RequestHandler = async (req, res, next) => {
  try {
    const id = param(req.params.id);
    const input = areaUpdateSchema.parse(req.body);
    const exists = await prisma.area.findUnique({ where: { id } });
    if (!exists) throw new NotFoundError('Area', 'المنطقة غير موجودة');
    const area = await prisma.area.update({ where: { id }, data: input });
    ok(res, area);
  } catch (err) {
    next(err);
  }
};

export const adminDeleteArea: RequestHandler = async (req, res, next) => {
  try {
    const id = param(req.params.id);
    const exists = await prisma.area.findUnique({ where: { id } });
    if (!exists) throw new NotFoundError('Area', 'المنطقة غير موجودة');
    await prisma.area.update({ where: { id }, data: { isActive: false } });
    ok(res, { id, isActive: false });
  } catch (err) {
    next(err);
  }
};
