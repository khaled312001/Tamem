import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { ok } from '../../utils/response.js';

const periodQuery = z.object({
  range: z.enum(['today', 'week', 'month']).default('week'),
});

function rangeBounds(range: 'today' | 'week' | 'month'): { from: Date; to: Date } {
  const now = new Date();
  const to = now;
  let from: Date;
  if (range === 'today') {
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (range === 'week') {
    from = new Date(now.getTime() - 7 * 86_400_000);
  } else {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return { from, to };
}

export const overview: RequestHandler = async (req, res, next) => {
  try {
    const { range } = periodQuery.parse(req.query);
    const { from, to } = rangeBounds(range);

    const [
      totalOrders,
      newOrders,
      pricedOrders,
      activeOrders,
      completedOrders,
      cancelledOrders,
      totalRevenue,
      pendingPayments,
      activeAlerts,
      availableDrivers,
      customersCount,
      ordersByService,
    ] = await Promise.all([
      prisma.order.count({ where: { createdAt: { gte: from, lte: to } } }),
      prisma.order.count({ where: { status: 'NEW' } }),
      prisma.order.count({ where: { status: 'PRICED' } }),
      prisma.order.count({
        where: {
          status: {
            in: ['ACCEPTED', 'DRIVER_ASSIGNED', 'PICKED_UP', 'IN_ROUTE'],
          },
        },
      }),
      prisma.order.count({
        where: {
          status: { in: ['COMPLETED', 'DELIVERED'] },
          OR: [{ completedAt: { gte: from, lte: to } }, { deliveredAt: { gte: from, lte: to } }],
        },
      }),
      prisma.order.count({
        where: { status: 'CANCELLED', cancelledAt: { gte: from, lte: to } },
      }),
      // Revenue = sum of whichever price is set (final preferred, quoted
      // fallback) for any order that's reached COMPLETED or DELIVERED in the
      // selected range. Counting DELIVERED keeps the dashboard honest even
      // when the admin hasn't bothered with the final "complete" tick.
      prisma.order.findMany({
        where: {
          status: { in: ['COMPLETED', 'DELIVERED'] },
          OR: [
            { completedAt: { gte: from, lte: to } },
            { deliveredAt: { gte: from, lte: to } },
            { createdAt: { gte: from, lte: to } }, // covers same-day fast-pathed orders
          ],
        },
        select: { finalPrice: true, quotedPrice: true },
      }),
      prisma.payment.count({ where: { status: 'PENDING' } }),
      prisma.alert.count({ where: { isResolved: false } }),
      prisma.driverProfile.count({ where: { status: 'AVAILABLE' } }),
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.order.groupBy({
        by: ['serviceId'],
        _count: true,
        where: { createdAt: { gte: from, lte: to } },
      }),
    ]);

    // 7-day trend (always last 7 days regardless of range). Revenue counts
    // any order that reached DELIVERED or COMPLETED that day, using finalPrice
    // when set otherwise falling back to quotedPrice.
    const trendStart = new Date(Date.now() - 7 * 86_400_000);
    const trendOrders = await prisma.order.findMany({
      where: { createdAt: { gte: trendStart } },
      select: { createdAt: true, status: true, finalPrice: true, quotedPrice: true },
    });
    const isEarning = (s: string) => s === 'COMPLETED' || s === 'DELIVERED';
    const trend: { day: string; orders: number; revenue: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      const day = trendOrders.filter((o) => o.createdAt.toISOString().slice(0, 10) === key);
      trend.push({
        day: key,
        orders: day.length,
        revenue: day.reduce(
          (s, o) => s + (isEarning(o.status) ? Number(o.finalPrice ?? o.quotedPrice ?? 0) : 0),
          0,
        ),
      });
    }

    const revenue = totalRevenue.reduce(
      (sum, o) => sum + Number(o.finalPrice ?? o.quotedPrice ?? 0),
      0,
    );

    // Join service names so the pie chart shows "دليفري سوبر ماركت" instead
    // of raw cuid IDs. One round-trip is fine here — the result set is at
    // most 10-20 rows in production.
    const serviceIds = ordersByService.map((g) => g.serviceId);
    const services = serviceIds.length
      ? await prisma.service.findMany({
          where: { id: { in: serviceIds } },
          select: { id: true, nameAr: true, category: true },
        })
      : [];
    const serviceMap = new Map(services.map((s) => [s.id, s]));

    ok(res, {
      kpis: {
        totalOrders,
        newOrders,
        pricedOrders,
        activeOrders,
        completedOrders,
        cancelledOrders,
        revenue,
        pendingPayments,
        activeAlerts,
        availableDrivers,
        customersCount,
      },
      trend,
      ordersByService: ordersByService.map((g) => {
        const svc = serviceMap.get(g.serviceId);
        return {
          serviceId: g.serviceId,
          serviceName: svc?.nameAr ?? 'غير معروف',
          category: svc?.category ?? null,
          count: typeof g._count === 'number' ? g._count : 0,
        };
      }),
      range,
      from,
      to,
    });
  } catch (err) {
    next(err);
  }
};
