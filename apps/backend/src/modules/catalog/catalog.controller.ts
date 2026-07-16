import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { isMerchantOpenNow } from '../merchants/merchantHours.js';
import { NotFoundError } from '../../utils/errors.js';
import { ok, paginated } from '../../utils/response.js';

const param = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new NotFoundError('Resource');
  return v;
};

const merchantsQuerySchema = z.object({
  categoryId: z.string().optional(),
  governorate: z.string().optional(),
  city: z.string().optional(),
  search: z.string().optional(),
  q: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  radiusKm: z.coerce.number().positive().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const productsQuerySchema = z.object({
  merchantId: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const merchantSelect = {
  id: true,
  storeName: true,
  storeNameAr: true,
  description: true,
  logoUrl: true,
  coverUrl: true,
  menuImages: true,
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
    // `q` is the new public search param; keep `search` working for older callers.
    const searchTerm = q.q ?? q.search;
    if (searchTerm) {
      where.OR = [
        { storeName: { contains: searchTerm } },
        { storeNameAr: { contains: searchTerm } },
      ];
    }

    // Geo branch — distance/radius filtering happens in memory after the query,
    // so we must paginate after filtering to keep `total` accurate.
    if (q.lat !== undefined && q.lng !== undefined) {
      const merchants = await prisma.merchantProfile.findMany({
        where,
        select: { ...merchantSelect, businessHours: true },
      });
      const withDistance = merchants.map((m) => ({
        ...m,
        openness: isMerchantOpenNow(m, m.businessHours),
        distanceKm: distanceKm(q.lat!, q.lng!, Number(m.lat), Number(m.lng)),
      }));
      const filtered = q.radiusKm
        ? withDistance.filter((m) => m.distanceKm <= q.radiusKm!)
        : withDistance;
      filtered.sort((a, b) => a.distanceKm - b.distanceKm);
      const total = filtered.length;
      const start = (q.page - 1) * q.pageSize;
      const page = filtered.slice(start, start + q.pageSize);
      paginated(res, page, { page: q.page, pageSize: q.pageSize, total });
      return;
    }

    const [merchants, total] = await Promise.all([
      prisma.merchantProfile.findMany({
        where,
        select: { ...merchantSelect, businessHours: true },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.merchantProfile.count({ where }),
    ]);

    // Attach `openness` to every merchant — the mobile uses this to badge
    // "مفتوح / مغلق / يفتح غداً" without a per-merchant follow-up call.
    const withOpenness = merchants.map((m) => ({
      ...m,
      openness: isMerchantOpenNow(m, m.businessHours),
    }));

    paginated(res, withOpenness, { page: q.page, pageSize: q.pageSize, total });
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

/**
 * Bulk openness lookup — the cart screen calls this with every merchantId
 * it has items from so it can badge each section "مفتوح / مغلق" without
 * issuing N separate /merchants/:id requests.
 */
const opennessBatchSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
});

export const merchantOpennessBatch: RequestHandler = async (req, res, next) => {
  try {
    const { ids } = opennessBatchSchema.parse(req.body);
    const rows = await prisma.merchantProfile.findMany({
      where: { id: { in: ids } },
      include: {
        businessHours: { orderBy: [{ dayOfWeek: 'asc' }, { openMin: 'asc' }] },
      },
    });
    const byId: Record<string, ReturnType<typeof isMerchantOpenNow>> = {};
    for (const m of rows) byId[m.id] = isMerchantOpenNow(m, m.businessHours);
    ok(res, byId);
  } catch (err) {
    next(err);
  }
};

export const getMerchantProducts: RequestHandler = async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { merchantId: param(req.params.id), isAvailable: true, isHidden: false },
      orderBy: { sortOrder: 'asc' },
    });
    ok(res, products);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /products/:id — single product with merchant info inlined so the
 * detail page can show "from store X" + openness without a follow-up call.
 */
export const getProduct: RequestHandler = async (req, res, next) => {
  try {
    const id = param(req.params.id);
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        merchant: {
          select: {
            id: true,
            storeNameAr: true,
            logoUrl: true,
            rating: true,
            manualStatus: true,
            timezone: true,
            businessHours: true,
          },
        },
      },
    });
    if (!product) throw new NotFoundError('Product', 'المنتج غير موجود');
    // Compute openness so the detail page can disable the add-to-cart button
    // when the store is closed — single source of truth lives on the server.
    const merchant = product.merchant;
    const openness = isMerchantOpenNow(
      { manualStatus: merchant.manualStatus, timezone: merchant.timezone },
      merchant.businessHours,
    );
    ok(res, { ...product, merchant: { ...merchant, businessHours: undefined, openness } });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /products — every available product across every active merchant.
 * Used by the QuickOrder products picker so the customer can browse without
 * picking a merchant first.
 */
export const listAllProducts: RequestHandler = async (req, res, next) => {
  try {
    const q = productsQuerySchema.parse(req.query);
    const where: Record<string, unknown> = { isAvailable: true };
    if (q.merchantId) where.merchantId = q.merchantId;
    if (q.q) {
      where.OR = [{ name: { contains: q.q } }, { nameAr: { contains: q.q } }];
    }
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
        include: {
          merchant: {
            select: { id: true, storeNameAr: true, isOpen: true },
          },
        },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.product.count({ where }),
    ]);
    paginated(res, products, { page: q.page, pageSize: q.pageSize, total });
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
