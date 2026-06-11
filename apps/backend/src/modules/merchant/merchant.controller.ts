/**
 * Merchant self-service controllers.
 *
 * These handlers power the merchant-facing mobile app. Each handler resolves
 * the merchant's `MerchantProfile.id` from `req.user!.id` and scopes every
 * query/mutation to that profile — a logged-in merchant can only see/edit
 * their own store, never another merchant's.
 *
 * Order status changes reuse `assertTransition` from orders.transitions so
 * the merchant flows are still bound by the project-wide state machine.
 */
import type { RequestHandler } from 'express';
import { z } from 'zod';

import { OrderStatus, UserRole } from '@tamem/types';

import { prisma } from '../../db/prisma.js';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../../utils/errors.js';
import { created, noContent, ok, paginated } from '../../utils/response.js';

import { dispatchOrderStatusChanged } from '../orders/orderEvents.js';
import { assertTransition } from '../orders/transitions.js';

const param = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new NotFoundError('Resource');
  return v;
};

/**
 * Resolve the MerchantProfile for the currently-authenticated merchant user.
 * Throws if the user has no profile attached — shouldn't happen for a
 * properly-onboarded MERCHANT but we surface a clear error rather than
 * leaking a null deref to the caller.
 */
async function getMyMerchantProfile(userId: string) {
  const profile = await prisma.merchantProfile.findUnique({
    where: { userId },
  });
  if (!profile) {
    throw new NotFoundError('MerchantProfile', 'حساب المتجر غير مكتمل');
  }
  return profile;
}

// ────────────────────────────────────────────────────────────────────────────
// Profile + stats
// ────────────────────────────────────────────────────────────────────────────

/**
 * GET /merchant/me — current merchant's profile + a small "today" KPI block
 * the mobile dashboard renders above the orders list. All numeric stats are
 * computed against the merchant's own orders/products only.
 */
export const me: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const profile = await prisma.merchantProfile.findUnique({
      where: { userId: req.user.id },
      include: {
        user: { select: { id: true, name: true, phone: true, isActive: true } },
        category: { select: { id: true, name: true, nameAr: true } },
      },
    });
    if (!profile) {
      throw new NotFoundError('MerchantProfile', 'حساب المتجر غير مكتمل');
    }

    // "Today" = since local midnight in UTC. We do a single bounded range
    // so the index on (status, createdAt) is usable.
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const pendingStatuses: OrderStatus[] = [
      OrderStatus.NEW,
      OrderStatus.UNDER_REVIEW,
      OrderStatus.PRICED,
    ];

    const [todayOrders, todayRevenueAgg, pendingOrders, productsCount] = await Promise.all([
      prisma.order.count({
        where: { merchantId: profile.id, createdAt: { gte: startOfDay } },
      }),
      prisma.order.aggregate({
        where: {
          merchantId: profile.id,
          createdAt: { gte: startOfDay },
          status: { in: [OrderStatus.DELIVERED, OrderStatus.COMPLETED] },
        },
        _sum: { finalPrice: true },
      }),
      prisma.order.count({
        where: { merchantId: profile.id, status: { in: pendingStatuses } },
      }),
      prisma.product.count({
        where: { merchantId: profile.id, isHidden: false },
      }),
    ]);

    ok(res, {
      ...profile,
      storeName: profile.storeNameAr || profile.storeName,
      stats: {
        todayOrders,
        todayRevenue: todayRevenueAgg._sum.finalPrice ? Number(todayRevenueAgg._sum.finalPrice) : 0,
        pendingOrders,
        productsCount,
        rating: profile.rating ? Number(profile.rating) : null,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ────────────────────────────────────────────────────────────────────────────
// Orders
// ────────────────────────────────────────────────────────────────────────────

const listOrdersQuery = z.object({
  status: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

/**
 * GET /merchant/orders — orders belonging to the current merchant, paginated.
 * The optional ?status filter accepts a single status or comma-separated list
 * so the mobile tabs can group multiple statuses under one filter chip.
 */
export const listOrders: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const q = listOrdersQuery.parse(req.query);
    const profile = await getMyMerchantProfile(req.user.id);

    const where: Record<string, unknown> = { merchantId: profile.id };
    if (q.status) {
      const list = q.status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      where.status = list.length === 1 ? (list[0] as OrderStatus) : { in: list as OrderStatus[] };
    }

    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          assignedDriver: {
            select: {
              id: true,
              name: true,
              phone: true,
              driverProfile: {
                select: { vehicleType: true, vehiclePlate: true },
              },
            },
          },
          items: true,
        },
      }),
      prisma.order.count({ where }),
    ]);
    paginated(res, items, { page: q.page, pageSize: q.pageSize, total });
  } catch (err) {
    next(err);
  }
};

/**
 * Load an order and assert it belongs to the current merchant. Used by every
 * order-mutation endpoint so a merchant can't act on someone else's order
 * even by guessing IDs.
 */
async function loadOwnOrder(userId: string, orderId: string) {
  const profile = await getMyMerchantProfile(userId);
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundError('Order', 'الطلب غير موجود');
  if (order.merchantId !== profile.id) {
    throw new ForbiddenError('هذا الطلب لا يخص متجرك');
  }
  return { profile, order };
}

const rejectSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

/**
 * PATCH /merchant/orders/:id/accept — merchant accepts the order. Accepted
 * source states are NEW / UNDER_REVIEW / PRICED so the merchant can short-
 * circuit the review/pricing dance for store orders. The transition is
 * validated by `assertTransition` so the underlying state machine still
 * blocks anything terminal (CANCELLED, REJECTED, COMPLETED).
 */
export const acceptOrder: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const { order } = await loadOwnOrder(req.user.id, param(req.params.id));

    const acceptableFrom: OrderStatus[] = [
      OrderStatus.NEW,
      OrderStatus.UNDER_REVIEW,
      OrderStatus.PRICED,
    ];
    if (!acceptableFrom.includes(order.status as OrderStatus)) {
      // Use assertTransition to throw a consistent InvalidTransitionError
      // — it will reject any state outside the acceptable set since
      // ACCEPTED is only reachable from PRICED / AWAITING_CUSTOMER_APPROVAL.
      assertTransition(order.status, OrderStatus.ACCEPTED, UserRole.ADMIN);
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.ACCEPTED },
    });

    await prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: OrderStatus.ACCEPTED,
        changedById: req.user.id,
        changedByRole: UserRole.MERCHANT,
        reason: 'Accepted by merchant',
      },
    });

    await dispatchOrderStatusChanged(req.app, updated, updated.status);
    ok(res, updated);
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /merchant/orders/:id/reject — merchant refuses to fulfil the order.
 * Source state must be non-terminal; we let `assertTransition` enforce that
 * by trying the move with the ADMIN role (merchants don't have a transition
 * permission in the shared map, so we validate FSM reachability only).
 */
export const rejectOrder: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const input = rejectSchema.parse(req.body);
    const { order } = await loadOwnOrder(req.user.id, param(req.params.id));

    // Only NEW/UNDER_REVIEW have REJECTED in the transition graph today.
    // Anything else (already ACCEPTED, in-flight, terminal) is refused
    // with the standard InvalidTransitionError so the mobile shows the
    // canonical "لا يمكن نقل الحالة" message.
    assertTransition(order.status, OrderStatus.REJECTED, UserRole.ADMIN);

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.REJECTED,
        cancelledAt: new Date(),
        cancellationReason: input.reason,
      },
    });

    await prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: OrderStatus.REJECTED,
        changedById: req.user.id,
        changedByRole: UserRole.MERCHANT,
        reason: input.reason,
      },
    });

    await dispatchOrderStatusChanged(req.app, updated, updated.status);
    ok(res, updated);
  } catch (err) {
    next(err);
  }
};

// ────────────────────────────────────────────────────────────────────────────
// Products
// ────────────────────────────────────────────────────────────────────────────

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const hhmmSchema = z.string().regex(HHMM_RE, 'Expected HH:MM (24h)');

const listProductsQuery = z.object({
  search: z.string().optional(),
  isAvailable: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

/**
 * GET /merchant/products — list this merchant's catalog, paginated. Hidden
 * (soft-deleted) products are excluded by default so the merchant only sees
 * what's actually live in their store.
 */
export const listProducts: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const q = listProductsQuery.parse(req.query);
    const profile = await getMyMerchantProfile(req.user.id);

    const where: Record<string, unknown> = { merchantId: profile.id, isHidden: false };
    if (q.isAvailable !== undefined) where.isAvailable = q.isAvailable;
    if (q.search) {
      where.OR = [{ name: { contains: q.search } }, { nameAr: { contains: q.search } }];
    }

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      }),
      prisma.product.count({ where }),
    ]);
    paginated(res, items, { page: q.page, pageSize: q.pageSize, total });
  } catch (err) {
    next(err);
  }
};

const createProductSchema = z.object({
  name: z.string().trim().min(1).max(255),
  nameAr: z.string().trim().min(1).max(255),
  description: z.string().max(2000).optional(),
  imageUrl: z.string().url().optional(),
  imageUrls: z.array(z.string().url()).max(5).optional(),
  price: z.number().nonnegative(),
  salePrice: z.number().nonnegative().optional(),
  discount: z.number().min(0).max(90).optional(),
  availableFrom: hhmmSchema.optional().or(z.literal('')),
  availableTo: hhmmSchema.optional().or(z.literal('')),
  unit: z.string().max(50).optional(),
  sku: z.string().trim().max(80).optional(),
  isAvailable: z.boolean().default(true),
  stock: z.number().int().nonnegative().optional(),
  sortOrder: z.number().int().default(0),
});

const updateProductSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    price: z.number().nonnegative().optional(),
    unit: z.string().max(50).nullable().optional(),
    isAvailable: z.boolean().optional(),
  })
  .strict();

/**
 * Strip empty-string sentinels the mobile form sends for cleared optional
 * inputs ("" → null) so Prisma writes a real null instead of an empty string
 * that would collide with the (merchantId, sku) unique index.
 */
function toPrismaProductData<T extends Record<string, unknown>>(input: T): T {
  const out: Record<string, unknown> = { ...input };
  for (const k of ['sku', 'availableFrom', 'availableTo'] as const) {
    if (out[k] === '') out[k] = null;
  }
  return out as T;
}

/**
 * POST /merchant/products — add a product to the current merchant's catalog.
 * `merchantId` is force-set from the authenticated profile so a merchant
 * can't slip an arbitrary merchantId in the body to inject products into
 * another store.
 */
export const createProduct: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const input = createProductSchema.parse(req.body);
    const profile = await getMyMerchantProfile(req.user.id);

    const product = await prisma.product.create({
      data: toPrismaProductData({ ...input, merchantId: profile.id }),
    });
    created(res, product);
  } catch (err) {
    next(err);
  }
};

/**
 * Load a product and assert it belongs to the current merchant so the
 * mutation endpoints can't be coerced into editing another store's catalog
 * by guessing product IDs.
 */
async function loadOwnProduct(userId: string, productId: string) {
  const profile = await getMyMerchantProfile(userId);
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new NotFoundError('Product', 'المنتج غير موجود');
  if (product.merchantId !== profile.id) {
    throw new ForbiddenError('هذا المنتج لا يخص متجرك');
  }
  return product;
}

/**
 * PATCH /merchant/products/:id — edit a handful of merchant-tunable fields.
 * Anything outside the allowed set (sku, externalId, sync timestamps, etc.)
 * is rejected by the strict schema so the merchant can't bypass admin-only
 * fields.
 */
export const updateProduct: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const input = updateProductSchema.parse(req.body);
    await loadOwnProduct(req.user.id, param(req.params.id));

    const updated = await prisma.product.update({
      where: { id: param(req.params.id) },
      data: input,
    });
    ok(res, updated);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /merchant/products/:id — soft delete via { isHidden: true }. The
 * row stays in the DB so historic OrderItem.productId references keep
 * resolving (we never want a completed order's product snapshot to 404).
 */
export const removeProduct: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    await loadOwnProduct(req.user.id, param(req.params.id));

    await prisma.product.update({
      where: { id: param(req.params.id) },
      data: { isHidden: true },
    });
    noContent(res);
  } catch (err) {
    next(err);
  }
};
