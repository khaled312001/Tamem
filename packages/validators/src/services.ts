import { z } from 'zod';

import { PricingMethod, ServiceCategory, ServiceFieldType } from '@tamem/types';

export const pricingMethodSchema = z.enum([
  PricingMethod.FIXED,
  PricingMethod.DISTANCE,
  PricingMethod.WEIGHT,
  PricingMethod.DISTANCE_WEIGHT,
  PricingMethod.QUOTE,
]);

export const serviceCategorySchema = z.enum([
  ServiceCategory.DELIVERY,
  ServiceCategory.SHIPPING,
  ServiceCategory.MERCHANT,
]);

export const serviceFieldTypeSchema = z.enum([
  ServiceFieldType.TEXT,
  ServiceFieldType.TEXTAREA,
  ServiceFieldType.NUMBER,
  ServiceFieldType.SELECT,
  ServiceFieldType.MULTISELECT,
  ServiceFieldType.IMAGE,
  ServiceFieldType.LOCATION,
  ServiceFieldType.DATE,
  ServiceFieldType.TIME,
  ServiceFieldType.BOOLEAN,
  ServiceFieldType.PHONE,
]);

export const serviceFieldOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  labelAr: z.string().min(1),
});

export const serviceFieldValidationSchema = z
  .object({
    min: z.number().optional(),
    max: z.number().optional(),
    minLength: z.number().int().nonnegative().optional(),
    maxLength: z.number().int().positive().optional(),
    regex: z.string().optional(),
    maxImages: z.number().int().positive().optional(),
  })
  .partial();

export const serviceFieldInputSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(
      /^[a-z][a-z0-9_]*$/,
      'مفتاح الحقل يجب أن يبدأ بحرف صغير ويحتوي فقط على حروف صغيرة وأرقام و _',
    ),
  label: z.string().trim().min(1).max(120),
  labelAr: z.string().trim().min(1).max(120),
  type: serviceFieldTypeSchema,
  isRequired: z.boolean().default(false),
  sortOrder: z.number().int().nonnegative().default(0),
  options: z.array(serviceFieldOptionSchema).optional(),
  validation: serviceFieldValidationSchema.optional(),
  placeholder: z.string().max(200).optional(),
  placeholderAr: z.string().max(200).optional(),
  helpText: z.string().max(500).optional(),
  helpTextAr: z.string().max(500).optional(),
});

export const serviceInputSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_-]*$/, 'مفتاح الخدمة يجب أن يبدأ بحرف صغير'),
  name: z.string().trim().min(2).max(120),
  nameAr: z.string().trim().min(2).max(120),
  category: serviceCategorySchema,
  imageUrl: z.string().url().optional(),
  iconUrl: z.string().url().optional(),
  description: z.string().max(1000).optional(),
  descriptionAr: z.string().max(1000).optional(),
  pricingMethod: pricingMethodSchema,
  basePrice: z.number().nonnegative().optional(),
  pricePerKm: z.number().nonnegative().optional(),
  pricePerKg: z.number().nonnegative().optional(),
  requiresPickupLocation: z.boolean().default(false),
  requiresDeliveryLocation: z.boolean().default(true),
  requiresImageUpload: z.boolean().default(false),
  allowsTextNote: z.boolean().default(true),
  supportsMultiplePickups: z.boolean().default(false),
  supportsMultipleDeliveries: z.boolean().default(false),
  sortOrder: z.number().int().nonnegative().default(0),
  isActive: z.boolean().default(true),
});

export type ServiceInput = z.infer<typeof serviceInputSchema>;
export type ServiceFieldInput = z.infer<typeof serviceFieldInputSchema>;
