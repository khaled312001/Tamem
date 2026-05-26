import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { ForbiddenError, UnauthorizedError } from '../../utils/errors.js';
import { ok } from '../../utils/response.js';

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/**
 * POST /me/location — driver pushes their current GPS coordinates. We update
 * the DriverProfile + emit a `driver:location` socket event to anyone
 * subscribed to the order rooms this driver is currently delivering, so the
 * customer's OrderTracking map updates live.
 */
export const updateMyLocation: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    if (req.user.role !== 'DRIVER') {
      throw new ForbiddenError('هذه الخدمة مخصصة للسائقين فقط');
    }
    const input = locationSchema.parse(req.body);

    await prisma.driverProfile.update({
      where: { userId: req.user.id },
      data: {
        currentLat: input.lat,
        currentLng: input.lng,
        lastLocationAt: new Date(),
      },
    });

    // Find every order the driver is currently delivering and broadcast on
    // those rooms — keeps the customer's map updating without giving them
    // continuous polling access.
    const activeOrders = await prisma.order.findMany({
      where: {
        assignedDriverId: req.user.id,
        status: { in: ['DRIVER_ASSIGNED', 'PICKED_UP', 'IN_ROUTE'] },
      },
      select: { id: true },
    });

    const io = req.app.locals.io;
    if (io && activeOrders.length > 0) {
      const payload = {
        driverId: req.user.id,
        lat: input.lat,
        lng: input.lng,
        at: new Date().toISOString(),
      };
      for (const o of activeOrders) {
        io.to(`order:${o.id}`).emit('driver:location', { ...payload, orderId: o.id });
      }
      io.to('admin:orders').emit('driver:location', payload);
    }

    ok(res, { saved: true, broadcasted: activeOrders.length });
  } catch (err) {
    next(err);
  }
};
