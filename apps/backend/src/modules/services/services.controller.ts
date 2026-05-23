import type { RequestHandler } from 'express';

import { serviceFieldInputSchema, serviceInputSchema } from '@tamem/validators';

import { prisma } from '../../db/prisma.js';
import { ConflictError, NotFoundError } from '../../utils/errors.js';
import { created, noContent, ok } from '../../utils/response.js';

const param = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new NotFoundError('Resource');
  return v;
};

// Public: list active services for the mobile home screen
export const list: RequestHandler = async (_req, res, next) => {
  try {
    const services = await prisma.service.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    ok(res, services);
  } catch (err) {
    next(err);
  }
};

// Public: full service detail including fields (used by DynamicForm)
export const getById: RequestHandler = async (req, res, next) => {
  try {
    const service = await prisma.service.findUnique({
      where: { id: param(req.params.id) },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!service || !service.isActive) throw new NotFoundError('Service', 'الخدمة غير موجودة');
    ok(res, service);
  } catch (err) {
    next(err);
  }
};

// ===== Admin =====

export const adminList: RequestHandler = async (_req, res, next) => {
  try {
    const services = await prisma.service.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { fields: true, orders: true } } },
    });
    ok(res, services);
  } catch (err) {
    next(err);
  }
};

export const adminCreate: RequestHandler = async (req, res, next) => {
  try {
    const input = serviceInputSchema.parse(req.body);
    const service = await prisma.service.create({
      data: { ...input, createdById: req.user!.id },
    });
    created(res, service);
  } catch (err) {
    next(err);
  }
};

export const adminUpdate: RequestHandler = async (req, res, next) => {
  try {
    const input = serviceInputSchema.partial().parse(req.body);
    const service = await prisma.service.update({
      where: { id: param(req.params.id) },
      data: input,
    });
    ok(res, service);
  } catch (err) {
    next(err);
  }
};

export const adminDelete: RequestHandler = async (req, res, next) => {
  try {
    const serviceId = param(req.params.id);

    // Reject if there are active orders on this service
    const activeOrders = await prisma.order.count({
      where: {
        serviceId,
        status: { notIn: ['COMPLETED', 'CANCELLED', 'REJECTED'] },
      },
    });
    if (activeOrders > 0) {
      throw new ConflictError(
        `Cannot delete service with ${activeOrders} active order(s)`,
        `لا يمكن حذف خدمة عليها ${activeOrders} طلب نشط`,
      );
    }

    // soft delete: deactivate instead of hard removing (preserves order history)
    await prisma.service.update({
      where: { id: serviceId },
      data: { isActive: false },
    });
    noContent(res);
  } catch (err) {
    next(err);
  }
};

export const adminDuplicate: RequestHandler = async (req, res, next) => {
  try {
    const sourceId = param(req.params.id);
    const source = await prisma.service.findUnique({
      where: { id: sourceId },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!source) throw new NotFoundError('Service', 'الخدمة غير موجودة');

    const newKey = `${source.key}-copy-${Date.now().toString(36)}`;
    const duplicate = await prisma.service.create({
      data: {
        key: newKey,
        name: `${source.name} (copy)`,
        nameAr: `${source.nameAr} (نسخة)`,
        category: source.category,
        imageUrl: source.imageUrl,
        iconUrl: source.iconUrl,
        description: source.description,
        descriptionAr: source.descriptionAr,
        pricingMethod: source.pricingMethod,
        basePrice: source.basePrice,
        pricePerKm: source.pricePerKm,
        pricePerKg: source.pricePerKg,
        requiresPickupLocation: source.requiresPickupLocation,
        requiresDeliveryLocation: source.requiresDeliveryLocation,
        requiresImageUpload: source.requiresImageUpload,
        allowsTextNote: source.allowsTextNote,
        supportsMultiplePickups: source.supportsMultiplePickups,
        supportsMultipleDeliveries: source.supportsMultipleDeliveries,
        sortOrder: source.sortOrder,
        isActive: false,
        createdById: req.user!.id,
        fields: {
          create: source.fields.map((f) => ({
            key: f.key,
            label: f.label,
            labelAr: f.labelAr,
            type: f.type,
            isRequired: f.isRequired,
            sortOrder: f.sortOrder,
            options: f.options ?? undefined,
            validation: f.validation ?? undefined,
            placeholder: f.placeholder,
            placeholderAr: f.placeholderAr,
            helpText: f.helpText,
            helpTextAr: f.helpTextAr,
          })),
        },
      },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
    created(res, duplicate);
  } catch (err) {
    next(err);
  }
};

// ===== Fields (admin only) =====

export const adminAddField: RequestHandler = async (req, res, next) => {
  try {
    const input = serviceFieldInputSchema.parse(req.body);
    const field = await prisma.serviceField.create({
      data: { ...input, serviceId: param(req.params.id) },
    });
    created(res, field);
  } catch (err) {
    next(err);
  }
};

export const adminUpdateField: RequestHandler = async (req, res, next) => {
  try {
    const input = serviceFieldInputSchema.partial().parse(req.body);
    const field = await prisma.serviceField.update({
      where: { id: param(req.params.fieldId) },
      data: input,
    });
    ok(res, field);
  } catch (err) {
    next(err);
  }
};

export const adminDeleteField: RequestHandler = async (req, res, next) => {
  try {
    await prisma.serviceField.delete({ where: { id: param(req.params.fieldId) } });
    noContent(res);
  } catch (err) {
    next(err);
  }
};

export const adminReorderFields: RequestHandler = async (req, res, next) => {
  try {
    const { fieldIds } = req.body as { fieldIds: string[] };
    await prisma.$transaction(
      fieldIds.map((fieldId, idx) =>
        prisma.serviceField.update({ where: { id: fieldId }, data: { sortOrder: idx } }),
      ),
    );
    ok(res, { reordered: fieldIds.length });
  } catch (err) {
    next(err);
  }
};
