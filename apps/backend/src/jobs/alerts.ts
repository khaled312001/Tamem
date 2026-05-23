import cron from 'node-cron';
import type { Server as SocketServer } from 'socket.io';

import { prisma } from '../db/prisma.js';
import { emitNewAlert } from '../realtime/channels.js';
import { logger } from '../utils/logger.js';

async function settingNumber(key: string, fallback: number): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { key } });
  const v = s?.value as unknown;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export async function runAlertSweep(io?: SocketServer): Promise<{ created: number }> {
  let created = 0;

  // 1) Orders PRICED but customer hasn't approved within N minutes
  const pendingMins = await settingNumber('order_pending_alert_minutes', 60);
  const pendingCutoff = new Date(Date.now() - pendingMins * 60_000);
  const stalePriced = await prisma.order.findMany({
    where: { status: 'PRICED', updatedAt: { lte: pendingCutoff } },
    select: { id: true, orderNumber: true },
  });
  for (const o of stalePriced) {
    const existing = await prisma.alert.findFirst({
      where: { type: 'PENDING_ORDER', relatedOrderId: o.id, isResolved: false },
    });
    if (existing) continue;
    const a = await prisma.alert.create({
      data: {
        type: 'PENDING_ORDER',
        severity: 'MEDIUM',
        title: 'Pending priced order',
        titleAr: 'طلب مسعّر بانتظار العميل',
        description: `Order ${o.orderNumber} priced > ${pendingMins}min ago without approval`,
        descriptionAr: `الطلب ${o.orderNumber} مسعّر منذ أكثر من ${pendingMins} دقيقة ولم يوافق العميل`,
        relatedOrderId: o.id,
      },
    });
    created++;
    emitNewAlert(io, a);
  }

  // 2) Drivers BUSY but no location update within N minutes
  const idleMins = await settingNumber('driver_idle_alert_minutes', 25);
  const idleCutoff = new Date(Date.now() - idleMins * 60_000);
  const silentDrivers = await prisma.driverProfile.findMany({
    where: {
      status: 'BUSY',
      OR: [{ lastLocationAt: null }, { lastLocationAt: { lte: idleCutoff } }],
    },
    select: { userId: true, user: { select: { name: true } } },
  });
  for (const d of silentDrivers) {
    const existing = await prisma.alert.findFirst({
      where: { type: 'DRIVER_NOT_RESPONDING', relatedUserId: d.userId, isResolved: false },
    });
    if (existing) continue;
    const a = await prisma.alert.create({
      data: {
        type: 'DRIVER_NOT_RESPONDING',
        severity: 'HIGH',
        title: 'Driver not responding',
        titleAr: 'سائق لا يستجيب',
        description: `Driver ${d.user.name} BUSY but no location > ${idleMins}min`,
        descriptionAr: `السائق ${d.user.name} مشغول لكن لم يحدّث موقعه منذ ${idleMins} دقيقة`,
        relatedUserId: d.userId,
      },
    });
    created++;
    emitNewAlert(io, a);
  }

  // 3) Drivers carrying cash above the limit
  const cashLimit = await settingNumber('driver_cash_limit', 1000);
  const cashHeavy = await prisma.driverProfile.findMany({
    where: { cashOnHand: { gt: cashLimit } },
    select: { userId: true, cashOnHand: true, user: { select: { name: true } } },
  });
  for (const d of cashHeavy) {
    const existing = await prisma.alert.findFirst({
      where: {
        type: 'CASH_LIMIT_EXCEEDED',
        relatedUserId: d.userId,
        isResolved: false,
      },
    });
    if (existing) continue;
    const a = await prisma.alert.create({
      data: {
        type: 'CASH_LIMIT_EXCEEDED',
        severity: 'CRITICAL',
        title: 'Driver cash over limit',
        titleAr: 'كاش السائق فوق الحد',
        description: `Driver ${d.user.name} holds ${d.cashOnHand} (limit ${cashLimit})`,
        descriptionAr: `السائق ${d.user.name} معه ${d.cashOnHand} جنيه (الحد ${cashLimit})`,
        relatedUserId: d.userId,
      },
    });
    created++;
    emitNewAlert(io, a);
  }

  if (created > 0) logger.info({ created }, 'alert sweep created new alerts');
  return { created };
}

export function startAlertsCron(io: SocketServer): void {
  // every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runAlertSweep(io);
    } catch (err) {
      logger.error({ err }, 'alert sweep failed');
    }
  });
  logger.info('🔔 alerts cron scheduled (every 5 min)');
}
