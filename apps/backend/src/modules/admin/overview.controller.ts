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
        where: { status: 'COMPLETED', completedAt: { gte: from, lte: to } },
      }),
      prisma.order.count({
        where: { status: 'CANCELLED', cancelledAt: { gte: from, lte: to } },
      }),
      prisma.order.aggregate({
        _sum: { finalPrice: true },
        where: { status: 'COMPLETED', completedAt: { gte: from, lte: to } },
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

    // 7-day trend (always last 7 days regardless of range)
    const trendStart = new Date(Date.now() - 7 * 86_400_000);
    const trendOrders = await prisma.order.findMany({
      where: { createdAt: { gte: trendStart } },
      select: { createdAt: true, status: true, finalPrice: true },
    });
    const trend: { day: string; orders: number; revenue: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      const day = trendOrders.filter((o) => o.createdAt.toISOString().slice(0, 10) === key);
      trend.push({
        day: key,
        orders: day.length,
        revenue: day.reduce(
          (s, o) => s + (o.status === 'COMPLETED' && o.finalPrice ? Number(o.finalPrice) : 0),
          0,
        ),
      });
    }

    ok(res, {
      kpis: {
        totalOrders,
        newOrders,
        pricedOrders,
        activeOrders,
        completedOrders,
        cancelledOrders,
        revenue: Number(totalRevenue._sum.finalPrice ?? 0),
        pendingPayments,
        activeAlerts,
        availableDrivers,
        customersCount,
      },
      trend,
      ordersByService: ordersByService.map((g) => ({
        serviceId: g.serviceId,
        count: g._count,
      })),
      range,
      from,
      to,
    });
  } catch (err) {
    next(err);
  }
};
