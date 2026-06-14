/**
 * Supervisors module — service layer.
 *
 * On-shift supervisor lookup + WhatsApp dispatch on new orders. The whole
 * module is best-effort: every entry-point function catches its own errors
 * so a misconfigured supervisor table (or a WhatsApp outage) never blocks
 * the order pipeline.
 */
import type { Order, Supervisor } from '@prisma/client';

import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { sendWhatsAppMessage } from '../../integrations/whatsapp.js';
import { logger } from '../../utils/logger.js';
import type { OrderContext } from '../orders/orderEvents.js';

const PAYMENT_METHOD_AR: Record<string, string> = {
  CASH: 'كاش عند الاستلام',
  VODAFONE_CASH: 'فودافون كاش',
  INSTAPAY: 'إنستا باي',
};

const ORDER_STATUS_AR: Record<string, string> = {
  NEW: 'جديد',
  UNDER_REVIEW: 'قيد المراجعة',
  PRICED: 'تم التسعير',
  AWAITING_CUSTOMER_APPROVAL: 'بانتظار موافقة العميل',
  ACCEPTED: 'مقبول',
  DRIVER_ASSIGNED: 'تم تعيين السائق',
  PICKED_UP: 'تم الاستلام',
  IN_ROUTE: 'في الطريق',
  DELIVERED: 'تم التسليم',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي',
  REJECTED: 'مرفوض',
};

/**
 * Return now() shifted into Africa/Cairo timezone so weekday / minute-of-day
 * math is done in Cairo wall-clock regardless of the server's TZ.
 */
function getCairoNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
}

/**
 * Match a single shift against the current Cairo wall-clock time.
 *
 * - daysOfWeek empty array  → all days
 * - daysOfWeek non-empty    → must include today's weekday (0=Sun..6=Sat)
 * - startTime <= endTime    → normal "[start, end]" range
 * - startTime  > endTime    → overnight shift ("[start, 24h) ∪ [0, end]")
 */
function isShiftActive(
  shift: { startTime: string; endTime: string; daysOfWeek: unknown },
  now: Date,
): boolean {
  // daysOfWeek is JSON in MySQL — Prisma already parses it, but we defensively
  // coerce in case the DB returned a string.
  let days: number[] = [];
  try {
    if (Array.isArray(shift.daysOfWeek)) {
      days = (shift.daysOfWeek as unknown[]).filter((n): n is number => typeof n === 'number');
    } else if (typeof shift.daysOfWeek === 'string') {
      const parsed = JSON.parse(shift.daysOfWeek);
      if (Array.isArray(parsed)) {
        days = parsed.filter((n): n is number => typeof n === 'number');
      }
    }
  } catch {
    days = [];
  }

  const dow = now.getDay(); // 0=Sun..6=Sat in local TZ
  if (days.length > 0 && !days.includes(dow)) return false;

  const [startH = 0, startM = 0] = shift.startTime.split(':').map(Number);
  const [endH = 0, endM = 0] = shift.endTime.split(':').map(Number);
  const startMin = startH * 60 + startM;
  const endMin = endH * 60 + endM;
  const cur = now.getHours() * 60 + now.getMinutes();

  return startMin <= endMin ? cur >= startMin && cur <= endMin : cur >= startMin || cur <= endMin;
}

/**
 * Returns the first active supervisor whose active shift covers the current
 * Cairo wall-clock time, or null if none match. Never throws.
 */
export async function getCurrentSupervisor(): Promise<Supervisor | null> {
  try {
    const now = getCairoNow();
    const supervisors = await prisma.supervisor.findMany({
      where: { isActive: true },
      include: { shifts: { where: { isActive: true } } },
      orderBy: { createdAt: 'asc' },
    });

    for (const sup of supervisors) {
      for (const shift of sup.shifts) {
        if (isShiftActive(shift, now)) {
          // Strip the `shifts` include before returning the bare Supervisor
          // so the call-site type matches Supervisor (not Supervisor & {shifts}).
          const { shifts: _shifts, ...bare } = sup;
          return bare as Supervisor;
        }
      }
    }
    return null;
  } catch (err) {
    logger.warn({ err }, 'getCurrentSupervisor failed — returning null');
    return null;
  }
}

/**
 * Pure formatter for the on-shift supervisor's WhatsApp message. Includes
 * every piece of info they need to action the order without opening the
 * dashboard — but also a deep link to it if they want to.
 */
export function buildOrderMessageForSupervisor(
  order: Order & {
    items?: Array<{
      productNameSnapshot: string;
      quantity: number;
      unitPriceSnapshot?: { toString(): string } | null;
    }> | null;
  },
  ctx: OrderContext,
  dashboardBase: string,
): string {
  const num = order.orderNumber;
  const statusAr = ORDER_STATUS_AR[order.status] ?? order.status;
  const payAr = order.paymentMethod
    ? (PAYMENT_METHOD_AR[order.paymentMethod] ?? order.paymentMethod)
    : 'غير محدد';
  const total = order.finalPrice ?? order.quotedPrice;
  const link = `${dashboardBase.replace(/\/$/, '')}/orders/${order.id}`;

  const lines: string[] = ['طلب جديد على المنصة (إشعار مشرف الوردية):', '', `رقم الأوردر: ${num}`];

  if (ctx.customerName) lines.push(`اسم العميل: ${ctx.customerName}`);
  // The order doesn't carry the customer phone directly; the supervisor can
  // reach the customer from the dashboard link below if needed.

  if (order.deliveryAddress) lines.push(`العنوان: ${order.deliveryAddress}`);
  else if (ctx.deliveryAddress) lines.push(`العنوان: ${ctx.deliveryAddress}`);

  // Items — catalog purchases. Quick orders (free-text) leave items empty.
  const items = order.items ?? [];
  if (items.length > 0) {
    lines.push('');
    lines.push('المنتجات:');
    for (const it of items) {
      lines.push(`  • ${it.productNameSnapshot} ×${it.quantity}`);
    }
  } else if (order.customData && typeof order.customData === 'object') {
    // Free-text fields (quick orders). Surface order_text/details/notes.
    const cd = order.customData as Record<string, unknown>;
    const desc =
      (typeof cd.order_text === 'string' && cd.order_text) ||
      (typeof cd.details === 'string' && cd.details) ||
      (typeof cd.description === 'string' && cd.description) ||
      '';
    if (desc) {
      lines.push('');
      lines.push(`وصف الطلب: ${desc}`);
    }
  }

  lines.push('');
  if (total != null) lines.push(`الإجمالي: ${total} ج.م`);
  lines.push(`طريقة الدفع: ${payAr}`);
  lines.push(`الحالة: ${statusAr}`);
  lines.push('');
  lines.push(`رابط الأوردر في الداشبورد:`);
  lines.push(link);
  lines.push('');
  lines.push('— تميم');

  return lines.join('\n');
}

/**
 * Integration entry called by the order-events bus on NEW. Resolves the
 * on-shift supervisor, sends them the order brief on WhatsApp, and records
 * a dispatch row (success or failure) for the reports tab.
 *
 * Never throws — every error path logs + returns. Callers must not depend
 * on this for correctness; it's a courtesy notification.
 */
export async function notifyOnShiftSupervisor(order: Order, ctx: OrderContext): Promise<void> {
  try {
    const supervisor = await getCurrentSupervisor();
    if (!supervisor) {
      logger.info({ orderId: order.id }, 'no supervisor on shift — skipping dispatch');
      return;
    }

    // Load items lazily so the formatter has them without forcing every
    // upstream caller to fetch them. Best-effort: an items load failure
    // just means the WhatsApp body skips the items section.
    let orderWithItems: Order & {
      items?: Array<{
        productNameSnapshot: string;
        quantity: number;
        unitPriceSnapshot: { toString(): string } | null;
      }> | null;
    } = order;
    try {
      const items = await prisma.orderItem.findMany({
        where: { orderId: order.id },
        select: { productNameSnapshot: true, quantity: true, unitPriceSnapshot: true },
      });
      orderWithItems = { ...order, items };
    } catch (err) {
      logger.warn({ err, orderId: order.id }, 'supervisor dispatch: items load failed');
    }

    const message = buildOrderMessageForSupervisor(orderWithItems, ctx, env.API_BASE_URL);

    let sent = false;
    let errorMessage: string | null = null;
    try {
      sent = await sendWhatsAppMessage({
        toPhone: supervisor.whatsappPhone,
        text: message,
      });
      if (!sent) errorMessage = 'WhatsApp send failed';
    } catch (err) {
      sent = false;
      errorMessage = err instanceof Error ? err.message.slice(0, 500) : 'WhatsApp send error';
      logger.warn({ err, orderId: order.id }, 'supervisor whatsapp send threw');
    }

    try {
      await prisma.supervisorOrderDispatch.create({
        data: {
          supervisorId: supervisor.id,
          orderId: order.id,
          status: sent ? 'SENT' : 'FAILED',
          errorMessage: sent ? null : errorMessage,
        },
      });
    } catch (err) {
      logger.warn({ err, orderId: order.id }, 'supervisor dispatch row create failed');
    }
  } catch (err) {
    logger.warn({ err, orderId: order.id }, 'notifyOnShiftSupervisor unexpected failure');
  }
}
