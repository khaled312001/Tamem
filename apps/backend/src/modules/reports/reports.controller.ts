import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { ok } from '../../utils/response.js';

const dateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  groupBy: z.enum(['day', 'week', 'month']).default('day'),
});

function bucketKey(d: Date, groupBy: 'day' | 'week' | 'month'): string {
  if (groupBy === 'day') return d.toISOString().slice(0, 10);
  if (groupBy === 'month') return d.toISOString().slice(0, 7);
  // ISO week
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export const revenue: RequestHandler = async (req, res, next) => {
  try {
    const q = dateRangeSchema.parse(req.query);
    const from = q.from ?? new Date(Date.now() - 30 * 86_400_000);
    const to = q.to ?? new Date();

    const orders = await prisma.order.findMany({
      where: {
        status: 'COMPLETED',
        completedAt: { gte: from, lte: to },
        finalPrice: { not: null },
      },
      select: { finalPrice: true, completedAt: true },
    });

    const buckets: Record<string, { revenue: number; orders: number }> = {};
    for (const o of orders) {
      if (!o.completedAt || !o.finalPrice) continue;
      const k = bucketKey(o.completedAt, q.groupBy);
      buckets[k] ??= { revenue: 0, orders: 0 };
      buckets[k].revenue += Number(o.finalPrice);
      buckets[k].orders += 1;
    }

    const series = Object.entries(buckets)
      .map(([key, v]) => ({ bucket: key, ...v }))
      .sort((a, b) => a.bucket.localeCompare(b.bucket));

    const total = series.reduce((s, e) => s + e.revenue, 0);
    ok(res, { series, total, ordersCount: orders.length, from, to });
  } catch (err) {
    next(err);
  }
};

export const services: RequestHandler = async (_req, res, next) => {
  try {
    const grouped = await prisma.order.groupBy({
      by: ['serviceId'],
      _count: true,
      _sum: { finalPrice: true },
    });
    const services = await prisma.service.findMany({
      where: { id: { in: grouped.map((g) => g.serviceId) } },
      select: { id: true, nameAr: true, category: true },
    });
    const result = grouped
      .map((g) => {
        const s = services.find((x) => x.id === g.serviceId);
        return {
          serviceId: g.serviceId,
          nameAr: s?.nameAr ?? '—',
          category: s?.category ?? 'DELIVERY',
          orders: g._count,
          revenue: Number(g._sum.finalPrice ?? 0),
        };
      })
      .sort((a, b) => b.orders - a.orders);
    ok(res, result);
  } catch (err) {
    next(err);
  }
};

export const drivers: RequestHandler = async (_req, res, next) => {
  try {
    const grouped = await prisma.order.groupBy({
      by: ['assignedDriverId'],
      where: { status: 'COMPLETED', assignedDriverId: { not: null } },
      _count: true,
      _sum: { finalPrice: true },
    });
    const driverIds = grouped.map((g) => g.assignedDriverId!).filter(Boolean);
    const driverUsers = await prisma.user.findMany({
      where: { id: { in: driverIds } },
      select: { id: true, name: true, phone: true, driverProfile: { select: { rating: true } } },
    });
    const result = grouped
      .map((g) => {
        const u = driverUsers.find((x) => x.id === g.assignedDriverId);
        return {
          driverId: g.assignedDriverId,
          name: u?.name ?? '—',
          phone: u?.phone ?? '',
          rating: u?.driverProfile?.rating ?? null,
          deliveries: g._count,
          totalRevenue: Number(g._sum.finalPrice ?? 0),
        };
      })
      .sort((a, b) => b.deliveries - a.deliveries)
      .slice(0, 50);
    ok(res, result);
  } catch (err) {
    next(err);
  }
};

export const customers: RequestHandler = async (_req, res, next) => {
  try {
    const grouped = await prisma.order.groupBy({
      by: ['customerId'],
      _count: true,
      _sum: { finalPrice: true },
    });
    const customerIds = grouped.map((g) => g.customerId);
    const customerUsers = await prisma.user.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, name: true, phone: true, city: true },
    });
    const result = grouped
      .map((g) => {
        const u = customerUsers.find((x) => x.id === g.customerId);
        return {
          customerId: g.customerId,
          name: u?.name ?? '—',
          phone: u?.phone ?? '',
          city: u?.city ?? '',
          orders: g._count,
          totalSpend: Number(g._sum.finalPrice ?? 0),
        };
      })
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 50);
    ok(res, result);
  } catch (err) {
    next(err);
  }
};
