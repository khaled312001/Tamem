/**
 * POST /orders/cart — multi-merchant checkout.
 *
 * The mobile cart can hold items from several merchants. Instead of asking
 * the customer to check out one merchant at a time, this endpoint accepts
 * one combined payload and fans it out into:
 *
 *   - One "parent" Order with no merchantId, holding the grand total,
 *     payment method, delivery address, and (eventually) the single
 *     payment record. parentOrder.category = DELIVERY, status = NEW.
 *   - N "child" Orders, one per merchant, each with their own items,
 *     subtotal, status timeline, and driver assignment. Children link
 *     back via parentOrderId.
 *
 * Single-merchant carts skip the parent and produce a single regular
 * Order to keep the existing dashboards/lists unchanged.
 *
 * Validation: every merchant must be open right now, every product must
 * exist + be available + belong to its claimed merchant. We refuse the
 * whole order if any line fails — partial checkout would be worse than a
 * clear error the user can act on.
 */
import type { RequestHandler } from 'express';
import { z } from 'zod';

import { OrderStatus, PaymentMethod, ServiceCategory } from '@tamem/types';

import { prisma } from '../../db/prisma.js';
import { BadRequestError, ConflictError, UnauthorizedError } from '../../utils/errors.js';
import { created } from '../../utils/response.js';

import { getMerchantOpenness } from '../merchants/merchantHours.js';

import { generateOrderNumber } from './orderNumber.js';

const cartItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive().max(99),
});

const merchantBlockSchema = z.object({
  merchantId: z.string().min(1),
  items: z.array(cartItemSchema).min(1),
  notes: z.string().trim().max(500).optional(),
  imageUrls: z.array(z.string().url()).max(3).optional(),
});

const cartCheckoutSchema = z.object({
  /** Resolved address for ALL sub-orders. */
  deliveryAddress: z.string().trim().min(3).max(500),
  deliveryLat: z.number().refine((v) => v >= -90 && v <= 90),
  deliveryLng: z.number().refine((v) => v >= -180 && v <= 180),
  paymentMethod: z.enum([PaymentMethod.CASH, PaymentMethod.VODAFONE_CASH, PaymentMethod.INSTAPAY]),
  scheduledFor: z.string().datetime().optional(),
  couponCode: z.string().trim().max(40).optional(),
  /** Shared notes applied to the parent order. Per-merchant notes go inside each block. */
  notes: z.string().trim().max(500).optional(),
  merchants: z.array(merchantBlockSchema).min(1),
});

export const createCartOrder: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const input = cartCheckoutSchema.parse(req.body);

    // ── 1. Look up every product in one query, key by id ────────────────
    const allProductIds = input.merchants.flatMap((m) => m.items.map((i) => i.productId));
    const products = await prisma.product.findMany({
      where: { id: { in: allProductIds } },
      select: {
        id: true,
        nameAr: true,
        price: true,
        salePrice: true,
        merchantId: true,
        isAvailable: true,
        isHidden: true,
        stock: true,
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    // ── 2. Validate every merchant block ─────────────────────────────────
    const merchantSummaries: Array<{
      merchantId: string;
      subtotal: number;
      items: Array<{ productId: string; nameAr: string; price: number; quantity: number }>;
      notes?: string;
      imageUrls?: string[];
    }> = [];

    // Resolve merchant display names once so error messages can name them.
    const merchantRows = await prisma.merchantProfile.findMany({
      where: { id: { in: input.merchants.map((m) => m.merchantId) } },
      select: { id: true, storeNameAr: true },
    });
    const merchantNameById = new Map(merchantRows.map((m) => [m.id, m.storeNameAr]));

    for (const block of input.merchants) {
      const merchantName = merchantNameById.get(block.merchantId) ?? 'المتجر';
      // Merchant must be open right now.
      const openness = await getMerchantOpenness(block.merchantId);
      if (openness && !openness.isOpenNow) {
        const detail = openness.message ?? 'مغلق حالياً';
        throw new ConflictError(
          'MERCHANT_CLOSED',
          `${merchantName} ${detail}. احذف منتجاته من السلة أو جدوّل الطلب لاحقاً.`,
        );
      }

      let subtotal = 0;
      const validatedItems: (typeof merchantSummaries)[number]['items'] = [];

      for (const item of block.items) {
        const product = byId.get(item.productId);
        if (!product) {
          throw new BadRequestError('PRODUCT_NOT_FOUND', `المنتج ${item.productId} غير موجود`);
        }
        if (product.merchantId !== block.merchantId) {
          throw new BadRequestError(
            'PRODUCT_MERCHANT_MISMATCH',
            `المنتج ${product.nameAr} لا ينتمي إلى المتجر المحدد`,
          );
        }
        if (!product.isAvailable || product.isHidden) {
          throw new ConflictError('PRODUCT_UNAVAILABLE', `المنتج ${product.nameAr} غير متاح`);
        }
        if (product.stock != null && product.stock < item.quantity) {
          throw new ConflictError(
            'INSUFFICIENT_STOCK',
            `الكمية المتاحة من ${product.nameAr} هي ${product.stock} فقط`,
          );
        }
        const unitPrice = Number(product.salePrice ?? product.price);
        subtotal += unitPrice * item.quantity;
        validatedItems.push({
          productId: product.id,
          nameAr: product.nameAr,
          price: unitPrice,
          quantity: item.quantity,
        });
      }

      merchantSummaries.push({
        merchantId: block.merchantId,
        subtotal: Math.round(subtotal * 100) / 100,
        items: validatedItems,
        notes: block.notes,
        imageUrls: block.imageUrls,
      });
    }

    // ── 3. Resolve the default delivery service ──────────────────────────
    // We look for one with category=DELIVERY and key prefix delivery-* —
    // the actual ride pricing comes from the merchant's delivery fee
    // policy (out of scope for this endpoint). For now we just need a
    // serviceId since Order.serviceId is non-null.
    const service = await prisma.service.findFirst({
      where: { category: ServiceCategory.DELIVERY, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!service) {
      throw new ConflictError('NO_DELIVERY_SERVICE', 'لا توجد خدمة توصيل مفعلة');
    }

    const grandTotal = merchantSummaries.reduce((a, m) => a + m.subtotal, 0);
    const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;

    // ── 4. Single-merchant carts: skip the parent, create one Order ──────
    if (merchantSummaries.length === 1) {
      const only = merchantSummaries[0]!;
      const order = await prisma.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          serviceId: service.id,
          customerId: req.user.id,
          category: ServiceCategory.DELIVERY,
          status: OrderStatus.NEW,
          merchantId: only.merchantId,
          deliveryAddress: input.deliveryAddress,
          deliveryLat: input.deliveryLat,
          deliveryLng: input.deliveryLng,
          paymentMethod: input.paymentMethod,
          quotedPrice: grandTotal,
          merchantSubtotal: only.subtotal,
          notes: input.notes ?? only.notes,
          imageUrls: only.imageUrls,
          scheduledFor,
          couponCode: input.couponCode,
          items: {
            create: only.items.map((it) => ({
              productId: it.productId,
              productNameSnapshot: it.nameAr,
              unitPriceSnapshot: it.price,
              quantity: it.quantity,
              merchantId: only.merchantId,
            })),
          },
        },
        include: { items: true, subOrders: true },
      });
      created(res, order);
      return;
    }

    // ── 5. Multi-merchant: parent + N children in one transaction ────────
    console.log('[orders/cart] creating parent + %d children', merchantSummaries.length);
    const result = await prisma.$transaction(async (tx) => {
      const parent = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          serviceId: service.id,
          customerId: req.user!.id,
          category: ServiceCategory.DELIVERY,
          status: OrderStatus.NEW,
          // No merchantId on the parent — it's a logistics-level wrapper.
          deliveryAddress: input.deliveryAddress,
          deliveryLat: input.deliveryLat,
          deliveryLng: input.deliveryLng,
          paymentMethod: input.paymentMethod,
          quotedPrice: grandTotal,
          notes: input.notes,
          scheduledFor,
          couponCode: input.couponCode,
        },
      });

      const children = [];
      for (const m of merchantSummaries) {
        const child = await tx.order.create({
          data: {
            orderNumber: generateOrderNumber(),
            serviceId: service.id,
            customerId: req.user!.id,
            category: ServiceCategory.DELIVERY,
            status: OrderStatus.NEW,
            merchantId: m.merchantId,
            // Each child inherits the same delivery address + payment.
            deliveryAddress: input.deliveryAddress,
            deliveryLat: input.deliveryLat,
            deliveryLng: input.deliveryLng,
            paymentMethod: input.paymentMethod,
            quotedPrice: m.subtotal,
            merchantSubtotal: m.subtotal,
            notes: m.notes,
            imageUrls: m.imageUrls,
            scheduledFor,
            parentOrderId: parent.id,
            items: {
              create: m.items.map((it) => ({
                productId: it.productId,
                productNameSnapshot: it.nameAr,
                unitPriceSnapshot: it.price,
                quantity: it.quantity,
                merchantId: m.merchantId,
              })),
            },
          },
        });
        children.push(child);
      }

      return { parent, children };
    });

    created(res, {
      ...result.parent,
      subOrders: result.children,
    });
  } catch (err) {
    // Surface the real cause in the backend terminal — the response is
    // still a generic 500, but the operator needs the stack to debug.
    console.error('[orders/cart] checkout failed:', err);
    next(err);
  }
};
