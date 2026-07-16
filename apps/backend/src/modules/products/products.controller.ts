import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { diffProduct, productActionFor, recordProductHistory } from '../audit/audit.controller.js';
import { NotFoundError } from '../../utils/errors.js';
import { created, noContent, ok, paginated } from '../../utils/response.js';

const param = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new NotFoundError('Resource');
  return v;
};

// Match the schema's @db.VarChar(5) cap and require strict HH:MM 24h form so the
// mobile can do a cheap lexical compare instead of parsing each time.
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const hhmmSchema = z.string().regex(HHMM_RE, 'Expected HH:MM (24h)');

const createSchema = z.object({
  merchantId: z.string(),
  name: z.string().trim().min(1).max(255),
  nameAr: z.string().trim().min(1).max(255),
  description: z.string().max(2000).optional(),
  imageUrl: z.string().url().optional(),
  /// Up to 5 extra image URLs. Persisted as a JSON array on the Product row.
  imageUrls: z.array(z.string().url()).max(5).optional(),
  price: z.number().nonnegative(),
  /// Absolute discounted price — mobile strikes through `price` when set.
  salePrice: z.number().nonnegative().optional(),
  /// Percentage off the base price. Capped at 90 to keep the UI sane and
  /// stop accidental near-free pricing.
  discount: z.number().min(0).max(90).optional(),
  /// Daily availability window in local time. Both must be set together
  /// (or both omitted). Empty string = "not set" so the form can clear it.
  availableFrom: hhmmSchema.optional().or(z.literal('')),
  availableTo: hhmmSchema.optional().or(z.literal('')),
  unit: z.string().max(50).optional(),
  sku: z.string().trim().max(80).optional(),
  barcode: z.string().trim().max(80).optional(),
  /// Free text, not a Category relation — merchants name their own aisles.
  categoryName: z.string().trim().max(120).optional(),
  isAvailable: z.boolean().default(true),
  stock: z.number().int().nonnegative().optional(),
  sortOrder: z.number().int().default(0),
});

/// merchantId stays updatable: the spreadsheet import carries a merchant
/// column, so re-assigning a product has to be expressible as an update.
const updateSchema = createSchema.partial();

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

/**
 * Normalize the parsed payload into a Prisma-friendly shape:
 *   - empty SKU / window strings become null (so the unique index works and
 *     the merchant can clear a previously-set value),
 *   - empty `imageUrls` array stays as [] so Prisma writes a real JSON array
 *     instead of leaving the column untouched.
 */
function toPrismaProductData<T extends Record<string, unknown>>(input: T): T {
  const out: Record<string, unknown> = { ...input };
  for (const k of ['sku', 'availableFrom', 'availableTo', 'barcode', 'categoryName'] as const) {
    if (out[k] === '') out[k] = null;
  }
  return out as T;
}

export const create: RequestHandler = async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const product = await prisma.product.create({ data: toPrismaProductData(input) });
    await recordProductHistory(req, {
      productId: product.id,
      productName: product.nameAr,
      action: 'CREATE',
    });
    created(res, product);
  } catch (err) {
    next(err);
  }
};

export const update: RequestHandler = async (req, res, next) => {
  try {
    const input = updateSchema.parse(req.body);
    const id = param(req.params.id);
    // Read first: the old values are what the trail is for, and the update
    // destroys them.
    const before = await prisma.product.findUnique({ where: { id } });
    const product = await prisma.product.update({
      where: { id },
      data: toPrismaProductData(input),
    });
    if (before) {
      const changes = diffProduct(
        before as unknown as Record<string, unknown>,
        product as unknown as Record<string, unknown>,
      );
      if (changes.length) {
        await recordProductHistory(req, {
          productId: id,
          productName: product.nameAr,
          action: productActionFor(changes),
          changes,
        });
      }
    }
    ok(res, product);
  } catch (err) {
    next(err);
  }
};

export const remove: RequestHandler = async (req, res, next) => {
  try {
    const id = param(req.params.id);
    // Captured before the row is gone — a trail that can only say "cmr9b… was
    // deleted" is useless.
    const doomed = await prisma.product.findUnique({ where: { id }, select: { nameAr: true } });
    try {
      // Real delete — admins asked to actually remove products, not just hide.
      await prisma.product.delete({ where: { id } });
      await recordProductHistory(req, {
        productId: id,
        productName: doomed?.nameAr ?? null,
        action: 'DELETE',
      });
    } catch (err) {
      // A product referenced by an existing order can't be hard-deleted
      // (FK). Fall back to deactivating it so the admin still gets it out of
      // the catalog without corrupting order history.
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code?: string }).code === 'P2003'
      ) {
        await prisma.product.update({ where: { id }, data: { isAvailable: false } });
        await recordProductHistory(req, {
          productId: id,
          productName: doomed?.nameAr ?? null,
          action: 'DEACTIVATE',
          changes: [{ field: 'isAvailable', old: true, new: false }],
        });
      } else {
        throw err;
      }
    }
    noContent(res);
  } catch (err) {
    next(err);
  }
};

export const bulkAvailability: RequestHandler = async (req, res, next) => {
  try {
    const input = bulkSchema.parse(req.body);
    // Read first: updateMany can't say which rows actually flipped, and logging
    // products that were already in the target state would be a lie.
    const before = await prisma.product.findMany({
      where: { id: { in: input.ids } },
      select: { id: true, nameAr: true, isAvailable: true },
    });
    const result = await prisma.product.updateMany({
      where: { id: { in: input.ids } },
      data: { isAvailable: input.isAvailable },
    });
    for (const p of before) {
      if (p.isAvailable === input.isAvailable) continue;
      await recordProductHistory(req, {
        productId: p.id,
        productName: p.nameAr,
        action: input.isAvailable ? 'ACTIVATE' : 'DEACTIVATE',
        changes: [{ field: 'isAvailable', old: p.isAvailable, new: input.isAvailable }],
      });
    }
    ok(res, { updated: result.count });
  } catch (err) {
    next(err);
  }
};
