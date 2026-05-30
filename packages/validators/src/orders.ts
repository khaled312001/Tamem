import { z } from 'zod';

import { PaymentMethod } from '@tamem/types';

import { serviceCategorySchema } from './services.js';

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const sizeCategorySchema = z.enum(['SMALL', 'MEDIUM', 'LARGE']);
export const speedTierSchema = z.enum(['STANDARD', 'EXPRESS']);

export const paymentMethodSchema = z.enum([
  PaymentMethod.CASH,
  PaymentMethod.VODAFONE_CASH,
  PaymentMethod.INSTAPAY,
]);

export const orderItemInputSchema = z.object({
  productId: z.string().min(1).optional(),
  productNameSnapshot: z.string().trim().min(1).max(255),
  quantity: z.number().int().positive(),
  merchantId: z.string().min(1).optional(),
  pickupPointIndex: z.number().int().nonnegative().optional(),
  notes: z.string().max(500).optional(),
});

export const orderPickupPointInputSchema = z.object({
  merchantId: z.string().min(1).optional(),
  label: z.string().max(120).optional(),
  address: z.string().trim().min(2).max(500),
  lat: z.number(),
  lng: z.number(),
  contactName: z.string().max(120).optional(),
  contactPhone: z.string().max(20).optional(),
  notes: z.string().max(500).optional(),
});

export const orderDeliveryPointInputSchema = z.object({
  recipientName: z.string().trim().min(2).max(120),
  recipientPhone: z.string().trim().min(8).max(20),
  address: z.string().trim().min(2).max(500),
  lat: z.number(),
  lng: z.number(),
  notes: z.string().max(500).optional(),
});

/**
 * Discriminated union by category for type-safe order creation.
 * - DELIVERY: single store, optional text/image
 * - SHIPPING: from/to with cargo details for price calculator
 * - MERCHANT: multi-pickup/delivery + items
 */
// Common opt-in fields that any order type may include. Kept as a shape so
// each variant can spread them without repeating.
const optionsShape = {
  /** Apply a promo code to discount the order amount. Backend validates it. */
  couponCode: z.string().trim().min(1).max(40).optional(),
  /** How much of the customer's wallet balance to spend on this order. */
  walletAmount: z.number().nonnegative().max(100_000).optional(),
  /** If set, the order is scheduled for this future timestamp instead of "now". */
  scheduledFor: z.coerce.date().optional(),
};

export const createOrderSchema = z.discriminatedUnion('category', [
  z.object({
    category: z.literal(serviceCategorySchema.enum.DELIVERY),
    serviceId: z.string().min(1),
    merchantId: z.string().min(1).optional(),
    notes: z.string().max(2000).optional(),
    imageUrls: z.array(z.string().url()).max(10).optional(),
    deliveryAddress: z.string().trim().min(2).max(500),
    deliveryLat: z.number(),
    deliveryLng: z.number(),
    paymentMethod: paymentMethodSchema,
    customData: z.record(z.string(), z.unknown()).optional(),
    ...optionsShape,
  }),
  z.object({
    category: z.literal(serviceCategorySchema.enum.SHIPPING),
    serviceId: z.string().min(1),
    pickupAddress: z.string().trim().min(2).max(500),
    pickupLat: z.number(),
    pickupLng: z.number(),
    deliveryAddress: z.string().trim().min(2).max(500),
    deliveryLat: z.number(),
    deliveryLng: z.number(),
    weightKg: z.number().positive().max(1000),
    sizeCategory: sizeCategorySchema,
    isFragile: z.boolean().default(false),
    speedTier: speedTierSchema.default('STANDARD'),
    notes: z.string().max(2000).optional(),
    paymentMethod: paymentMethodSchema,
    customData: z.record(z.string(), z.unknown()).optional(),
    ...optionsShape,
  }),
  z.object({
    category: z.literal(serviceCategorySchema.enum.MERCHANT),
    serviceId: z.string().min(1),
    items: z.array(orderItemInputSchema).min(1),
    pickupPoints: z.array(orderPickupPointInputSchema).min(1).max(20),
    deliveryPoints: z.array(orderDeliveryPointInputSchema).min(1).max(20),
    notes: z.string().max(2000).optional(),
    paymentMethod: paymentMethodSchema.optional(),
    customData: z.record(z.string(), z.unknown()).optional(),
    ...optionsShape,
  }),
]);

export const pricingEstimateSchema = z.object({
  serviceId: z.string().min(1),
  pickupLat: z.number().optional(),
  pickupLng: z.number().optional(),
  deliveryLat: z.number().optional(),
  deliveryLng: z.number().optional(),
  weightKg: z.number().nonnegative().optional(),
  sizeCategory: sizeCategorySchema.optional(),
  isFragile: z.boolean().optional(),
  speedTier: speedTierSchema.optional(),
});

export const setPriceSchema = z.object({
  quotedPrice: z.number().nonnegative(),
  note: z.string().max(500).optional(),
});

export const assignDriverSchema = z.object({
  driverId: z.string().min(1),
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(2).max(500),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type PricingEstimateInput = z.infer<typeof pricingEstimateSchema>;
export type SetPriceInput = z.infer<typeof setPriceSchema>;
export type AssignDriverInput = z.infer<typeof assignDriverSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
