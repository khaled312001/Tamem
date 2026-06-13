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

const driverStatusSchema = z.enum(['AVAILABLE', 'BUSY', 'OFFLINE']);

const createDriverSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z
    .string()
    .trim()
    .regex(/^\+?\d{8,15}$/),
  password: z.string().min(6).max(100),
  vehicleType: z.string().trim().min(1).max(50),
  vehiclePlate: z.string().trim().min(1).max(20),
  nationalId: z.string().trim().min(4).max(30).optional(),
  licenseImageUrl: z.string().url().optional(),
  governorate: z.string().trim().min(1).max(100),
  notes: z.string().max(2000).optional(),
});

const updateDriverSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  // Admin can change the driver's login phone + add secondary contacts.
  phone: z
    .string()
    .trim()
    .regex(/^\+?\d{8,15}$/)
    .optional(),
  secondaryPhones: z
    .array(
      z
        .string()
        .trim()
        .regex(/^\+?\d{8,15}$/),
    )
    .max(3)
    .optional(),
  vehicleType: z.string().trim().min(1).max(50).optional(),
  vehiclePlate: z.string().trim().min(1).max(20).optional(),
  nationalId: z.string().trim().min(4).max(30).optional(),
  licenseImageUrl: z.string().url().optional(),
  governorate: z.string().trim().min(1).max(100).optional(),
  notes: z.string().max(2000).optional(),
  isActive: z.boolean().optional(),
});

const listQuerySchema = z.object({
  status: driverStatusSchema.optional(),
  governorate: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

export const list: RequestHandler = async (req, res, next) => {
  try {
    const q = listQuerySchema.parse(req.query);
    const where: Record<string, unknown> = { role: 'DRIVER' };
    if (q.search) {
      where.OR = [{ name: { contains: q.search } }, { phone: { contains: q.search } }];
    }
    const driverWhere: Record<string, unknown> = {};
    if (q.status) driverWhere.status = q.status;
    if (q.governorate) driverWhere.governorate = q.governorate;
    if (Object.keys(driverWhere).length) where.driverProfile = driverWhere;

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { createdAt: 'desc' },
        include: { driverProfile: true },
      }),
      prisma.user.count({ where }),
    ]);

    // Compute live delivery counts from the orders table — the stored
    // DriverProfile.totalDeliveries counter is unreliable (it was never
    // incremented in code). One grouped query stays O(N drivers) instead
    // of N separate counts.
    const ids = items.map((u) => u.id);
    const counts = ids.length
      ? await prisma.order.groupBy({
          by: ['assignedDriverId'],
          where: {
            assignedDriverId: { in: ids },
            status: { in: ['COMPLETED', 'DELIVERED'] },
          },
          _count: { _all: true },
        })
      : [];
    const byDriver = new Map(
      counts.map((c) => [c.assignedDriverId, c._count._all] as [string | null, number]),
    );
    const enriched = items.map((u) => ({
      ...u,
      driverProfile: u.driverProfile
        ? {
            ...u.driverProfile,
            totalDeliveries: byDriver.get(u.id) ?? 0,
          }
        : null,
    }));

    paginated(res, enriched, { page: q.page, pageSize: q.pageSize, total });
  } catch (err) {
    next(err);
  }
};

export const get: RequestHandler = async (req, res, next) => {
  try {
    const driver = await prisma.user.findFirst({
      where: { id: param(req.params.id), role: 'DRIVER' },
      include: { driverProfile: true },
    });
    if (!driver) throw new NotFoundError('Driver', 'السائق غير موجود');

    // Quick stats — totalDeliveries is computed live from the orders
    // table so it always matches reality, independent of the (unused)
    // DriverProfile.totalDeliveries counter.
    const [totalOrders, activeOrders, totalDeliveries, reviews, ratingAgg] = await Promise.all([
      prisma.order.count({ where: { assignedDriverId: driver.id } }),
      prisma.order.count({
        where: {
          assignedDriverId: driver.id,
          status: { notIn: ['COMPLETED', 'CANCELLED', 'REJECTED'] },
        },
      }),
      prisma.order.count({
        where: {
          assignedDriverId: driver.id,
          status: { in: ['COMPLETED', 'DELIVERED'] },
        },
      }),
      // Recent reviews where this driver was rated — used by the dashboard
      // to render the "Reviews" tab on the driver detail dialog.
      prisma.orderReview.findMany({
        where: { driverId: driver.id, driverRating: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          rating: true,
          driverRating: true,
          comment: true,
          createdAt: true,
          order: { select: { id: true, orderNumber: true } },
        },
      }),
      // Live driverRating average so the value matches the reviews list.
      prisma.orderReview.aggregate({
        where: { driverId: driver.id, driverRating: { not: null } },
        _avg: { driverRating: true },
        _count: { driverRating: true },
      }),
    ]);

    const liveRating = ratingAgg._avg.driverRating;
    const enriched = {
      ...driver,
      driverProfile: driver.driverProfile
        ? {
            ...driver.driverProfile,
            totalDeliveries,
            // Prefer the just-recomputed average so a stale row never shows.
            rating: liveRating ?? driver.driverProfile.rating,
          }
        : null,
      stats: {
        totalOrders,
        activeOrders,
        totalDeliveries,
        reviewCount: ratingAgg._count.driverRating,
        averageRating: liveRating ?? null,
      },
      reviews,
    };
    ok(res, enriched);
  } catch (err) {
    next(err);
  }
};

export const create: RequestHandler = async (req, res, next) => {
  try {
    const input = createDriverSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { phone: input.phone } });
    if (existing) throw new ConflictError('Phone already used', 'هذا الرقم مسجل بالفعل');

    const passwordHash = await bcrypt.hash(input.password, 12);
    const driver = await prisma.user.create({
      data: {
        phone: input.phone,
        name: input.name,
        passwordHash,
        role: 'DRIVER',
        isPhoneVerified: true,
        isActive: true,
        governorate: input.governorate,
        driverProfile: {
          create: {
            status: 'OFFLINE',
            vehicleType: input.vehicleType,
            vehiclePlate: input.vehiclePlate,
            nationalId: input.nationalId,
            licenseImageUrl: input.licenseImageUrl,
            governorate: input.governorate,
            notes: input.notes,
          },
        },
      },
      include: { driverProfile: true },
    });
    created(res, driver);
  } catch (err) {
    next(err);
  }
};

export const update: RequestHandler = async (req, res, next) => {
  try {
    const input = updateDriverSchema.parse(req.body);
    const driverId = param(req.params.id);
    const driver = await prisma.user.findFirst({
      where: { id: driverId, role: 'DRIVER' },
      include: { driverProfile: true },
    });
    if (!driver) throw new NotFoundError('Driver', 'السائق غير موجود');

    const userData: Record<string, unknown> = {};
    if (input.name) userData.name = input.name;
    if (input.governorate) userData.governorate = input.governorate;
    if (typeof input.isActive === 'boolean') userData.isActive = input.isActive;
    if (input.phone && input.phone !== driver.phone) {
      const clash = await prisma.user.findUnique({
        where: { phone: input.phone },
        select: { id: true },
      });
      if (clash && clash.id !== driverId) {
        throw new ConflictError('PHONE_TAKEN', 'هذا الرقم مسجّل لمستخدم آخر');
      }
      userData.phone = input.phone;
    }
    if (input.secondaryPhones) userData.secondaryPhones = input.secondaryPhones;

    const profileData: Record<string, unknown> = {};
    if (input.vehicleType) profileData.vehicleType = input.vehicleType;
    if (input.vehiclePlate) profileData.vehiclePlate = input.vehiclePlate;
    if (input.nationalId !== undefined) profileData.nationalId = input.nationalId;
    if (input.licenseImageUrl !== undefined) profileData.licenseImageUrl = input.licenseImageUrl;
    if (input.governorate) profileData.governorate = input.governorate;
    if (input.notes !== undefined) profileData.notes = input.notes;

    const updated = await prisma.user.update({
      where: { id: driverId },
      data: {
        ...userData,
        ...(Object.keys(profileData).length ? { driverProfile: { update: profileData } } : {}),
      },
      include: { driverProfile: true },
    });
    ok(res, updated);
  } catch (err) {
    next(err);
  }
};

export const updateStatus: RequestHandler = async (req, res, next) => {
  try {
    const { status } = z.object({ status: driverStatusSchema }).parse(req.body);
    const driverId = param(req.params.id);
    const driver = await prisma.driverProfile.update({
      where: { userId: driverId },
      data: { status, ...(status === 'AVAILABLE' ? { lastLocationAt: new Date() } : {}) },
    });
    ok(res, driver);
  } catch (err) {
    next(err);
  }
};

export const remove: RequestHandler = async (req, res, next) => {
  try {
    const driverId = param(req.params.id);
    const active = await prisma.order.count({
      where: {
        assignedDriverId: driverId,
        status: { notIn: ['COMPLETED', 'CANCELLED', 'REJECTED'] },
      },
    });
    if (active > 0) {
      throw new ConflictError(
        `Cannot remove driver with ${active} active order(s)`,
        `لا يمكن حذف سائق عليه ${active} طلب نشط`,
      );
    }
    // Soft delete — flip isActive
    await prisma.user.update({ where: { id: driverId }, data: { isActive: false } });
    noContent(res);
  } catch (err) {
    next(err);
  }
};
