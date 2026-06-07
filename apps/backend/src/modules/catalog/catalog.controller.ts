import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { isMerchantOpenNow } from '../merchants/merchantHours.js';
import { NotFoundError } from '../../utils/errors.js';
import { ok } from '../../utils/response.js';

const param = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new NotFoundError('Resource');
  return v;
};

const merchantsQuerySchema = z.object({
  categoryId: z.string().optional(),
  governorate: z.string().optional(),
  city: z.string().optional(),
  search: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  radiusKm: z.coerce.number().positive().max(100).optional(),
});

const merchantSelect = {
  id: true,
  storeName: true,
  storeNameAr: true,
  description: true,
  logoUrl: true,
  coverUrl: true,
  addressLine: true,
  lat: true,
  lng: true,
  governorate: true,
  city: true,
  rating: true,
  isOpen: true,
  manualStatus: true,
  timezone: true,
  category: { select: { id: true, name: true, nameAr: true, iconUrl: true } },
} as const;

// Haversine — quick distance (km) between two LatLng pairs
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export const listCategories: RequestHandler = async (_req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    ok(res, categories);
  } catch (err) {
    next(err);
  }
};

export const listMerchants: RequestHandler = async (req, res, next) => {
  try {
    const q = merchantsQuerySchema.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.governorate) where.governorate = q.governorate;
    if (q.city) where.city = q.city;
    if (q.search) {
      where.OR = [{ storeName: { contains: q.search } }, { storeNameAr: { contains: q.search } }];
    }

    let merchants = await prisma.merchantProfile.findMany({
      where,
      select: { ...merchantSelect, businessHours: true },
    });

    // Attach `openness` to every merchant — the mobile uses this to badge
    // "مفتوح / مغلق / يفتح غداً" without a per-merchant follow-up call.
    const withOpenness = merchants.map((m) => ({
      ...m,
      openness: isMerchantOpenNow(m, m.businessHours),
    }));

    // Compute distance + filter by radius if lat/lng provided
    if (q.lat !== undefined && q.lng !== undefined) {
      const withDistance = withOpenness.map((m) => ({
        ...m,
        distanceKm: distanceKm(q.lat!, q.lng!, Number(m.lat), Number(m.lng)),
      }));
      const filtered = q.radiusKm
        ? withDistance.filter((m) => m.distanceKm <= q.radiusKm!)
        : withDistance;
      filtered.sort((a, b) => a.distanceKm - b.distanceKm);
      ok(res, filtered);
      return;
    }

    ok(res, withOpenness);
  } catch (err) {
    next(err);
  }
};

export const getMerchant: RequestHandler = async (req, res, next) => {
  try {
    const merchant = await prisma.merchantProfile.findUnique({
      where: { id: param(req.params.id) },
      select: {
        ...merchantSelect,
        products: true,
        openHours: true,
        businessHours: {
          orderBy: [{ dayOfWeek: 'asc' }, { openMin: 'asc' }],
        },
      },
    });
    if (!merchant) throw new NotFoundError('Merchant', 'المتجر غير موجود');
    // Compute openness server-side so the mobile gets a single truth.
    const openness = isMerchantOpenNow(merchant, merchant.businessHours);
    ok(res, { ...merchant, openness });
  } catch (err) {
    next(err);
  }
};

export const getMerchantProducts: RequestHandler = async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { merchantId: param(req.params.id), isAvailable: true },
      orderBy: { sortOrder: 'asc' },
    });
    ok(res, products);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /products — every available product across every active merchant.
 * Used by the QuickOrder products picker so the customer can browse without
 * picking a merchant first.
 */
export const listAllProducts: RequestHandler = async (_req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { isAvailable: true },
      orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
      include: {
        merchant: {
          select: { id: true, storeNameAr: true, isOpen: true },
        },
      },
      take: 200,
    });
    ok(res, products);
  } catch (err) {
    next(err);
  }
};

export const listOffers: RequestHandler = async (_req, res, next) => {
  try {
    const now = new Date();
    const offers = await prisma.offer.findMany({
      where: {
        isActive: true,
        OR: [
          { startsAt: null, endsAt: null },
          { startsAt: { lte: now }, endsAt: null },
          { startsAt: null, endsAt: { gte: now } },
          { startsAt: { lte: now }, endsAt: { gte: now } },
        ],
      },
      orderBy: { sortOrder: 'asc' },
    });
    ok(res, offers);
  } catch (err) {
    next(err);
  }
};
