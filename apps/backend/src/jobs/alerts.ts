/**
 * Alert sweep — runs every 5 minutes and creates alerts for problems the
 * operations team needs to act on. Each rule:
 *
 *   1. Reads its threshold from the Setting table (so admins can tune
 *      without a redeploy).
 *   2. Computes a stable `triggerKey` so re-running the sweep on the same
 *      problem doesn't create duplicate rows.
 *   3. Tags the alert with the proper category for the dashboard filters.
 *
 * Rule list:
 *
 *   • Order NEW > N min (admin hasn't even looked yet)       → MEDIUM/HIGH
 *   • Order priced > N min ago, customer didn't approve     → MEDIUM
 *   • Order PRICED/UNDER_REVIEW > N min, merchant idle       → HIGH
 *   • Order ACCEPTED > N min without driver                  → CRITICAL
 *   • Order DRIVER_ASSIGNED > N min, never picked up         → HIGH
 *   • Order IN_ROUTE > N min, never delivered                → HIGH
 *   • Driver BUSY but no GPS ping > N min                    → HIGH
 *   • Driver cash on hand > limit                            → CRITICAL
 *   • Payment PENDING > N min (online flow)                  → HIGH
 *   • Payment FAILED                                         → CRITICAL
 *
 * Add new rules at the bottom following the same pattern.
 */
import type { AlertCategory, AlertSeverity, AlertType } from '@prisma/client';
import cron from 'node-cron';
import type { Server as SocketServer } from 'socket.io';

import { prisma } from '../db/prisma.js';
import { emitNewAlert } from '../realtime/channels.js';
import { logger } from '../utils/logger.js';

/** AlertType → AlertCategory map. Single source of truth. */
const TYPE_TO_CATEGORY: Record<AlertType, AlertCategory> = {
  PENDING_ORDER: 'ORDER',
  MERCHANT_NOT_ACCEPTING: 'MERCHANT',
  ORDER_STALE_IN_STAGE: 'DELAY',
  DRIVER_NOT_ASSIGNED: 'ORDER',
  DRIVER_PICKUP_LATE: 'DELAY',
  DRIVER_DELIVERY_LATE: 'DELAY',
  DRIVER_NOT_RESPONDING: 'DRIVER',
  CASH_LIMIT_EXCEEDED: 'DRIVER',
  COMPLAINT: 'COMPLAINT',
  PAYMENT_PENDING: 'PAYMENT',
  PAYMENT_FAILED: 'PAYMENT',
  REFUND_REQUESTED: 'PAYMENT',
  ORDER_CANCELLED_AFTER_PAY: 'PAYMENT',
  STATUS_UPDATE_ERROR: 'SYSTEM',
};

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

/**
 * Insert an alert only if no OPEN/ACKNOWLEDGED alert with the same
 * triggerKey already exists. Returns the alert when created, null when
 * deduplicated. `triggerKey` must be unique per (target × problem).
 */
async function upsertAlert(opts: {
  type: AlertType;
  severity: AlertSeverity;
  titleAr: string;
  descriptionAr: string;
  triggerKey: string;
  triggerReason: string;
  relatedOrderId?: string;
  relatedUserId?: string;
}): Promise<{ id: string; triggerKey: string | null } | null> {
  const existing = await prisma.alert.findFirst({
    where: {
      triggerKey: opts.triggerKey,
      status: { in: ['OPEN', 'ACKNOWLEDGED', 'ESCALATED'] },
    },
    select: { id: true },
  });
  if (existing) return null;

  return prisma.alert.create({
    data: {
      type: opts.type,
      category: TYPE_TO_CATEGORY[opts.type],
      severity: opts.severity,
      status: 'OPEN',
      isResolved: false,
      title: opts.titleAr, // we only ship Arabic; the English columns mirror
      titleAr: opts.titleAr,
      description: opts.descriptionAr,
      descriptionAr: opts.descriptionAr,
      triggerKey: opts.triggerKey,
      triggerReason: opts.triggerReason,
      relatedOrderId: opts.relatedOrderId,
      relatedUserId: opts.relatedUserId,
    },
    select: { id: true, triggerKey: true },
  });
}

export async function runAlertSweep(io?: SocketServer): Promise<{ created: number }> {
  let created = 0;
  const fire = async (alert: Awaited<ReturnType<typeof upsertAlert>>) => {
    if (!alert) return;
    created++;
    // Refetch with the full payload so the socket consumers don't have to
    // chase a follow-up request.
    const full = await prisma.alert.findUnique({ where: { id: alert.id } });
    if (full) emitNewAlert(io, full);
  };

  // ── 0. Brand-new orders the admin hasn't touched ──────────────────
  // Without this rule a fresh NEW order sitting overnight produces zero
  // alerts because every other rule targets a status the admin would
  // only reach by acting first (UNDER_REVIEW, PRICED, etc.). Severity
  // escalates to HIGH once it crosses 60 minutes.
  const newMin = await settingNumber('order_new_alert_minutes', 15);
  const newCutoff = new Date(Date.now() - newMin * 60_000);
  const staleNew = await prisma.order.findMany({
    where: { status: 'NEW', createdAt: { lte: newCutoff } },
    select: { id: true, orderNumber: true, createdAt: true },
  });
  for (const o of staleNew) {
    const ageMin = Math.floor((Date.now() - o.createdAt.getTime()) / 60_000);
    const severity: AlertSeverity = ageMin >= 60 ? 'HIGH' : 'MEDIUM';
    // Bucketed by age so an order that crossed the 60-min line opens a
    // fresh higher-severity alert (the previous MEDIUM dedup row stays
    // until resolved, so the team sees the escalation explicitly).
    const bucket = ageMin >= 60 ? 'OVER_60M' : `OVER_${newMin}M`;
    await fire(
      await upsertAlert({
        type: 'PENDING_ORDER',
        severity,
        titleAr: 'طلب جديد بدون مراجعة',
        descriptionAr: `الطلب ${o.orderNumber} موجود منذ ${ageMin} دقيقة بدون أي تحرك. ابدأ المراجعة.`,
        triggerKey: `PENDING_ORDER:${o.id}:NEW_${bucket}`,
        triggerReason: `NEW + > ${ageMin}m`,
        relatedOrderId: o.id,
      }),
    );
  }

  // ── 1. Order PRICED with no customer approval ─────────────────────
  const pendingMin = await settingNumber('order_pending_alert_minutes', 60);
  const pendingCutoff = new Date(Date.now() - pendingMin * 60_000);
  const stalePriced = await prisma.order.findMany({
    where: { status: 'PRICED', updatedAt: { lte: pendingCutoff } },
    select: { id: true, orderNumber: true },
  });
  for (const o of stalePriced) {
    await fire(
      await upsertAlert({
        type: 'PENDING_ORDER',
        severity: pendingMin >= 120 ? 'HIGH' : 'MEDIUM',
        titleAr: 'طلب مسعّر بانتظار العميل',
        descriptionAr: `الطلب ${o.orderNumber} مسعّر منذ أكثر من ${pendingMin} دقيقة ولم يوافق العميل بعد.`,
        triggerKey: `PENDING_ORDER:${o.id}:PRICED_OVER_${pendingMin}M`,
        triggerReason: `PRICED + > ${pendingMin}m`,
        relatedOrderId: o.id,
      }),
    );
  }

  // ── 2. UNDER_REVIEW too long → merchant/admin idle ────────────────
  const reviewMin = await settingNumber('order_review_alert_minutes', 30);
  const reviewCutoff = new Date(Date.now() - reviewMin * 60_000);
  const staleReview = await prisma.order.findMany({
    where: { status: 'UNDER_REVIEW', updatedAt: { lte: reviewCutoff } },
    select: { id: true, orderNumber: true },
  });
  for (const o of staleReview) {
    await fire(
      await upsertAlert({
        type: 'MERCHANT_NOT_ACCEPTING',
        severity: 'HIGH',
        titleAr: 'طلب لم يتم تسعيره',
        descriptionAr: `الطلب ${o.orderNumber} تحت المراجعة منذ ${reviewMin} دقيقة بدون تسعير. تواصل مع التاجر.`,
        triggerKey: `MERCHANT_NOT_ACCEPTING:${o.id}:REVIEW_OVER_${reviewMin}M`,
        triggerReason: `UNDER_REVIEW + > ${reviewMin}m`,
        relatedOrderId: o.id,
      }),
    );
  }

  // ── 3. ACCEPTED but no driver assigned ────────────────────────────
  const noDriverMin = await settingNumber('order_no_driver_alert_minutes', 15);
  const noDriverCutoff = new Date(Date.now() - noDriverMin * 60_000);
  const noDriver = await prisma.order.findMany({
    where: {
      status: 'ACCEPTED',
      assignedDriverId: null,
      updatedAt: { lte: noDriverCutoff },
    },
    select: { id: true, orderNumber: true },
  });
  for (const o of noDriver) {
    await fire(
      await upsertAlert({
        type: 'DRIVER_NOT_ASSIGNED',
        severity: 'CRITICAL',
        titleAr: 'طلب بدون سائق',
        descriptionAr: `الطلب ${o.orderNumber} متاح للتعيين منذ ${noDriverMin} دقيقة بدون سائق. عيّن سائق فوراً.`,
        triggerKey: `DRIVER_NOT_ASSIGNED:${o.id}:ACCEPTED_OVER_${noDriverMin}M`,
        triggerReason: `ACCEPTED + no driver + > ${noDriverMin}m`,
        relatedOrderId: o.id,
      }),
    );
  }

  // ── 4. Driver assigned but never picked up ────────────────────────
  const pickupMin = await settingNumber('order_pickup_late_minutes', 30);
  const pickupCutoff = new Date(Date.now() - pickupMin * 60_000);
  const pickupLate = await prisma.order.findMany({
    where: { status: 'DRIVER_ASSIGNED', updatedAt: { lte: pickupCutoff } },
    select: { id: true, orderNumber: true, assignedDriverId: true },
  });
  for (const o of pickupLate) {
    await fire(
      await upsertAlert({
        type: 'DRIVER_PICKUP_LATE',
        severity: 'HIGH',
        titleAr: 'تأخّر السائق في الاستلام',
        descriptionAr: `السائق معيّن للطلب ${o.orderNumber} منذ ${pickupMin} دقيقة ولم يستلم بعد.`,
        triggerKey: `DRIVER_PICKUP_LATE:${o.id}:ASSIGNED_OVER_${pickupMin}M`,
        triggerReason: `DRIVER_ASSIGNED + > ${pickupMin}m`,
        relatedOrderId: o.id,
        relatedUserId: o.assignedDriverId ?? undefined,
      }),
    );
  }

  // ── 5. In route but never delivered ───────────────────────────────
  const deliveryMin = await settingNumber('order_delivery_late_minutes', 60);
  const deliveryCutoff = new Date(Date.now() - deliveryMin * 60_000);
  const deliveryLate = await prisma.order.findMany({
    where: { status: 'IN_ROUTE', updatedAt: { lte: deliveryCutoff } },
    select: { id: true, orderNumber: true, assignedDriverId: true },
  });
  for (const o of deliveryLate) {
    await fire(
      await upsertAlert({
        type: 'DRIVER_DELIVERY_LATE',
        severity: 'HIGH',
        titleAr: 'تأخّر في توصيل الطلب',
        descriptionAr: `الطلب ${o.orderNumber} في الطريق منذ ${deliveryMin} دقيقة ولم يصل بعد. تواصل مع السائق.`,
        triggerKey: `DRIVER_DELIVERY_LATE:${o.id}:INROUTE_OVER_${deliveryMin}M`,
        triggerReason: `IN_ROUTE + > ${deliveryMin}m`,
        relatedOrderId: o.id,
        relatedUserId: o.assignedDriverId ?? undefined,
      }),
    );
  }

  // ── 6. Drivers BUSY but no location ping ──────────────────────────
  const idleMin = await settingNumber('driver_idle_alert_minutes', 25);
  const idleCutoff = new Date(Date.now() - idleMin * 60_000);
  const silentDrivers = await prisma.driverProfile.findMany({
    where: {
      status: 'BUSY',
      OR: [{ lastLocationAt: null }, { lastLocationAt: { lte: idleCutoff } }],
    },
    select: { userId: true, user: { select: { name: true } } },
  });
  for (const d of silentDrivers) {
    await fire(
      await upsertAlert({
        type: 'DRIVER_NOT_RESPONDING',
        severity: 'HIGH',
        titleAr: 'سائق لا يستجيب',
        descriptionAr: `السائق ${d.user.name} مشغول لكن لم يحدّث موقعه منذ ${idleMin} دقيقة.`,
        triggerKey: `DRIVER_NOT_RESPONDING:${d.userId}:NO_PING_${idleMin}M`,
        triggerReason: `BUSY + no location ping`,
        relatedUserId: d.userId,
      }),
    );
  }

  // ── 7. Drivers over cash limit ────────────────────────────────────
  const cashLimit = await settingNumber('driver_cash_limit', 1000);
  const cashHeavy = await prisma.driverProfile.findMany({
    where: { cashOnHand: { gt: cashLimit } },
    select: { userId: true, cashOnHand: true, user: { select: { name: true } } },
  });
  for (const d of cashHeavy) {
    await fire(
      await upsertAlert({
        type: 'CASH_LIMIT_EXCEEDED',
        severity: 'CRITICAL',
        titleAr: 'كاش السائق فوق الحد',
        descriptionAr: `السائق ${d.user.name} معه ${d.cashOnHand} جنيه (الحد ${cashLimit}). لازم تحصّل النقدية.`,
        triggerKey: `CASH_LIMIT_EXCEEDED:${d.userId}:OVER_${cashLimit}`,
        triggerReason: `cashOnHand > ${cashLimit}`,
        relatedUserId: d.userId,
      }),
    );
  }

  // ── 8. Payments pending too long ──────────────────────────────────
  const payPendingMin = await settingNumber('payment_pending_alert_minutes', 30);
  const payCutoff = new Date(Date.now() - payPendingMin * 60_000);
  const payPending = await prisma.payment.findMany({
    where: { status: 'PENDING', createdAt: { lte: payCutoff } },
    select: { id: true, orderId: true, order: { select: { orderNumber: true } } },
  });
  for (const p of payPending) {
    await fire(
      await upsertAlert({
        type: 'PAYMENT_PENDING',
        severity: 'HIGH',
        titleAr: 'دفع لم يكتمل',
        descriptionAr: `الطلب ${p.order?.orderNumber ?? '—'} عنده عملية دفع معلّقة منذ ${payPendingMin} دقيقة.`,
        triggerKey: `PAYMENT_PENDING:${p.id}:PENDING_OVER_${payPendingMin}M`,
        triggerReason: `PENDING > ${payPendingMin}m`,
        relatedOrderId: p.orderId,
      }),
    );
  }

  // ── 9. Payments failed ────────────────────────────────────────────
  const failedPayments = await prisma.payment.findMany({
    where: {
      status: 'FAILED',
      createdAt: { gte: new Date(Date.now() - 2 * 86_400_000) }, // last 48h
    },
    select: { id: true, orderId: true, order: { select: { orderNumber: true } } },
  });
  for (const p of failedPayments) {
    await fire(
      await upsertAlert({
        type: 'PAYMENT_FAILED',
        severity: 'CRITICAL',
        titleAr: 'فشل في عملية الدفع',
        descriptionAr: `فشلت عملية دفع الطلب ${p.order?.orderNumber ?? '—'}. تواصل مع العميل.`,
        triggerKey: `PAYMENT_FAILED:${p.id}`,
        triggerReason: `payment status = FAILED`,
        relatedOrderId: p.orderId,
      }),
    );
  }

  if (created > 0) logger.info({ created }, 'alert sweep created new alerts');
  return { created };
}

export function startAlertsCron(io: SocketServer): void {
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runAlertSweep(io);
    } catch (err) {
      logger.error({ err }, 'alert sweep failed');
    }
  });
  // Catch-up: run one sweep right after boot so a server restart doesn't
  // leave the dashboard quiet for up to 5 minutes while orders that went
  // stale during the downtime sit invisible.
  setTimeout(() => {
    runAlertSweep(io)
      .then(({ created }) => logger.info({ created }, '🔔 startup alert sweep complete'))
      .catch((err) => logger.error({ err }, 'startup alert sweep failed'));
  }, 5_000);
  logger.info('🔔 alerts cron scheduled (every 5 min, expanded rules)');
}
