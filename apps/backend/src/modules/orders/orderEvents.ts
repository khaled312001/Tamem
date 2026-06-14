/**
 * Side-effects bus for order state changes.
 *
 * Every time an order changes status (from any controller: admin or customer)
 * we:
 *   1. emit Socket.IO event so the dashboard + the customer's mobile + the assigned
 *      driver all see the change in real time;
 *   2. create an in-app Notification record for the customer (and the driver if assigned);
 *   3. dispatch a WhatsApp message via Cloud API if configured (no-op otherwise).
 *
 * Controllers must call dispatchOrderStatusChanged() after the DB update, never inline
 * fire-and-forget — keeping this centralized prevents the dashboard and mobile from
 * drifting out of sync.
 */
import type { Order } from '@prisma/client';
import type { Application } from 'express';

import { ORDER_STATUS_AR, type OrderStatus } from '@tamem/types';

import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { sendPushToUser } from '../../integrations/fcm.js';
import { sendWhatsAppMessage } from '../../integrations/whatsapp.js';
import { emitOrderStatusChange } from '../../realtime/channels.js';
import { logger } from '../../utils/logger.js';
import { notifyOnShiftSupervisor } from '../supervisors/supervisors.service.js';

type NotifChannel = 'IN_APP' | 'WHATSAPP' | 'PUSH';

interface StatusMessages {
  titleAr: string;
  bodyAr: string;
  channel: NotifChannel;
  /** WhatsApp message for the customer. Only set on the 4 major-stage
   *  transitions + final CANCELLED/REJECTED so we don't spam them with
   *  every granular FSM step. */
  customerWhatsappBody?: string;
}

/**
 * Per-event enrichment so customer-facing messages carry the data the
 * user actually wants — driver name + phone on DRIVER_ASSIGNED, order
 * summary on NEW, etc. We resolve this once in dispatch and reuse it
 * across the IN_APP / FCM / WhatsApp fan-out so all three channels stay
 * consistent.
 */
export interface OrderContext {
  customerName?: string;
  driverName?: string;
  driverPhone?: string;
  pickupAddress?: string;
  deliveryAddress?: string;
}

/**
 * Customer-facing messages. We keep granular in-app titles for the 12-state
 * FSM (so the audit timeline reads naturally), but WhatsApp is only sent
 * on the 4 MAJOR-STAGE transitions matching the admin's stepper:
 *
 *   استلام  → NEW          "أهلاً، استلمنا طلبك"
 *   مؤكد    → ACCEPTED     "تم قبول طلبك، بنحضّر المندوب"
 *   متجه    → PICKED_UP    "المندوب في الطريق ليك + بياناته"
 *   تم      → DELIVERED    "تم التسليم، قيّم تجربتك"
 *
 * Intermediate states (UNDER_REVIEW / PRICED / AWAITING / DRIVER_ASSIGNED /
 * IN_ROUTE / COMPLETED) intentionally do NOT send WhatsApp — the customer
 * already got the major-stage update and the in-app notification covers
 * the granularity. Only CANCELLED / REJECTED override and force WhatsApp.
 */
function messagesFor(
  order: Order,
  status: OrderStatus,
  ctx: OrderContext = {},
): StatusMessages | null {
  const num = order.orderNumber;
  const price = order.quotedPrice ? `${order.quotedPrice} ج.م` : '';
  const sig = '\n\n— تميم للتوصيل';

  switch (status) {
    case 'NEW': {
      const summary = [
        ctx.customerName ? `العميل: ${ctx.customerName}` : '',
        ctx.deliveryAddress ? `العنوان: ${ctx.deliveryAddress}` : '',
        price ? `الإجمالي التقديري: ${price}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      const body =
        `أهلاً بك في تميم.\n` +
        `استلمنا طلبك رقم ${num} بنجاح.\n` +
        (summary ? summary + '\n\n' : '') +
        `هنبعتلك تأكيد جديد بمجرد ما الإدارة تقبل الطلب.` +
        sig;
      return {
        titleAr: 'تم استلام طلبك',
        bodyAr: body,
        channel: 'IN_APP',
        customerWhatsappBody: body, // stage 1
      };
    }
    case 'UNDER_REVIEW':
      return {
        titleAr: 'طلبك قيد المراجعة',
        bodyAr: `طلب ${num} قيد المراجعة.\nالفريق بيتحقق من التفاصيل ويسعّره الآن.` + sig,
        channel: 'IN_APP',
      };
    case 'PRICED':
      return {
        titleAr: 'تم تسعير طلبك',
        bodyAr: `طلب ${num} جاهز.\nالسعر: ${price}\n` + sig,
        channel: 'IN_APP',
      };
    case 'AWAITING_CUSTOMER_APPROVAL':
      return {
        titleAr: 'بانتظار موافقتك',
        bodyAr:
          `طلب ${num} في انتظار موافقتك.\n` +
          (price ? `السعر النهائي: ${price}\n\n` : '\n') +
          `افتح التطبيق ووافق علشان نبدأ التجهيز.` +
          sig,
        channel: 'IN_APP',
      };
    case 'ACCEPTED': {
      const body =
        `شكراً ليك.\n` +
        `طلب ${num} اتقبل وبنحضّر المندوب المناسب ليه.` +
        (price ? `\nالإجمالي: ${price}` : '') +
        sig;
      return {
        titleAr: 'تم قبول طلبك',
        bodyAr: body,
        channel: 'IN_APP',
        customerWhatsappBody: body, // stage 2
      };
    }
    case 'DRIVER_ASSIGNED': {
      const driverLine = ctx.driverName
        ? `المندوب: ${ctx.driverName}` +
          (ctx.driverPhone ? `\nرقم التواصل: ${ctx.driverPhone}` : '')
        : 'المندوب هيكلمك قريباً جداً.';
      return {
        titleAr: 'تم تعيين السائق',
        bodyAr:
          `طلب ${num} في طريقه إليك.\n` + driverLine + (price ? `\nالإجمالي: ${price}` : '') + sig,
        channel: 'IN_APP',
      };
    }
    case 'PICKED_UP': {
      const driverLine = ctx.driverName
        ? `المندوب: ${ctx.driverName}` + (ctx.driverPhone ? `\nللتواصل: ${ctx.driverPhone}` : '')
        : '';
      const body =
        `المندوب استلم طلب ${num} وبدأ التحرك ليك.\n` +
        (driverLine ? driverLine + '\n' : '') +
        `استعد للاستلام خلال دقايق.` +
        sig;
      return {
        titleAr: 'الطلب في الطريق',
        bodyAr: body,
        channel: 'IN_APP',
        customerWhatsappBody: body, // stage 3
      };
    }
    case 'IN_ROUTE':
      return {
        titleAr: 'الطلب وصل لمنطقتك',
        bodyAr: `طلب ${num} قرّب يوصل.\nجهّز التواجد عند العنوان من فضلك.` + sig,
        channel: 'IN_APP',
      };
    case 'DELIVERED': {
      const body =
        `تم تسليم طلب ${num} بنجاح.\n` + `شكراً لاختيارك تميم — قيّم تجربتك من التطبيق.` + sig;
      return {
        titleAr: 'تم تسليم الطلب',
        bodyAr: body,
        channel: 'IN_APP',
        customerWhatsappBody: body, // stage 4
      };
    }
    case 'COMPLETED':
      return {
        titleAr: 'تم إكمال الطلب',
        bodyAr: `طلب ${num} مكتمل بالكامل.\nنتمنى أن نخدمك مرة أخرى قريباً.` + sig,
        channel: 'IN_APP',
      };
    case 'CANCELLED': {
      const body =
        `تم إلغاء طلب ${num}.` +
        (order.cancellationReason ? `\nالسبب: ${order.cancellationReason}` : '') +
        `\n\nلو فيه أي استفسار، تواصل معنا.` +
        sig;
      return {
        titleAr: 'تم إلغاء الطلب',
        bodyAr: body,
        channel: 'IN_APP',
        customerWhatsappBody: body, // exception
      };
    }
    case 'REJECTED': {
      const body =
        `للأسف ما قدرناش ننفذ طلب ${num}.` +
        (order.cancellationReason ? `\nالسبب: ${order.cancellationReason}` : '') +
        `\n\nنعتذر، تواصل معنا للتفاصيل.` +
        sig;
      return {
        titleAr: 'تعذّر تنفيذ الطلب',
        bodyAr: body,
        channel: 'IN_APP',
        customerWhatsappBody: body, // exception
      };
    }
    default:
      return null;
  }
}

/**
 * Merchant WhatsApp messages — 2 events that matter for the store owner:
 * NEW (طلب جديد جالك) and DELIVERED (تم التسليم). Returns null otherwise.
 */
function merchantWhatsappFor(order: Order, status: OrderStatus): string | null {
  const num = order.orderNumber;
  const sig = '\n\n— تميم للتوصيل';
  switch (status) {
    case 'NEW':
      return (
        `طلب جديد جالك على متجرك.\n` +
        `رقم الطلب: ${num}\n` +
        `افتح تطبيق التاجر لمراجعة التفاصيل والقبول.` +
        sig
      );
    case 'DELIVERED':
      return `تم تسليم طلب ${num} بنجاح للعميل.\n` + `شكراً للتعاون مع تميم.` + sig;
    default:
      return null;
  }
}

/**
 * Driver WhatsApp messages — one event: DRIVER_ASSIGNED (رحلة جديدة).
 */
function driverWhatsappFor(order: Order, status: OrderStatus): string | null {
  const num = order.orderNumber;
  const sig = '\n\n— تميم للتوصيل';
  if (status !== 'DRIVER_ASSIGNED') return null;
  return (
    `اتعينت على رحلة جديدة.\n` +
    `رقم الطلب: ${num}\n` +
    (order.pickupAddress ? `الاستلام: ${order.pickupAddress}\n` : '') +
    (order.deliveryAddress ? `التسليم: ${order.deliveryAddress}\n` : '') +
    `افتح تطبيق الكابتن للتفاصيل وبدء الرحلة.` +
    sig
  );
}

/**
 * Admin WhatsApp broadcast — fires on NEW so the duty admin sees every
 * incoming order on the business number even when they're not online.
 */
function adminWhatsappFor(order: Order, status: OrderStatus, ctx: OrderContext): string | null {
  const num = order.orderNumber;
  const sig = '\n\n— تميم';
  if (status !== 'NEW') return null;
  return (
    `طلب جديد على المنصة.\n` +
    `رقم: ${num}\n` +
    (ctx.customerName ? `العميل: ${ctx.customerName}\n` : '') +
    (ctx.deliveryAddress ? `العنوان: ${ctx.deliveryAddress}\n` : '') +
    (order.quotedPrice ? `الإجمالي التقديري: ${order.quotedPrice} ج.م\n` : '') +
    `افتح لوحة الإدارة للمراجعة.` +
    sig
  );
}

export async function dispatchOrderStatusChanged(
  app: Application,
  order: Order,
  newStatus: OrderStatus,
): Promise<void> {
  // 0. Loyalty credit on COMPLETED — best-effort, idempotent
  if (newStatus === 'COMPLETED' && order.finalPrice && order.customerId) {
    try {
      const { creditLoyaltyForCompletedOrder } = await import('../wallet/wallet.controller.js');
      await creditLoyaltyForCompletedOrder(order.customerId, order.id, Number(order.finalPrice));
    } catch (err) {
      logger.warn({ err, orderId: order.id }, 'loyalty credit failed');
    }
  }

  // 1. Realtime — fan out to admin:orders, user:<customerId>, user:<driverId>, order:<id>
  emitOrderStatusChange(app.locals.io, order);

  // 1b. Resolve enrichment context once so all 3 channels (in-app, push,
  //     WhatsApp) carry identical info. Driver lookup only fires when the
  //     status transition is one the customer needs driver details for.
  const ctx: OrderContext = {
    deliveryAddress: order.deliveryAddress ?? undefined,
    pickupAddress: order.pickupAddress ?? undefined,
  };
  try {
    const c = await prisma.user.findUnique({
      where: { id: order.customerId },
      select: { name: true },
    });
    ctx.customerName = c?.name ?? undefined;
  } catch {
    /* swallow — message just loses one field */
  }
  if (order.assignedDriverId) {
    try {
      const d = await prisma.user.findUnique({
        where: { id: order.assignedDriverId },
        select: { name: true, phone: true },
      });
      ctx.driverName = d?.name ?? undefined;
      ctx.driverPhone = d?.phone ?? undefined;
    } catch {
      /* swallow */
    }
  }

  // 2. In-app notification for the customer
  const msgs = messagesFor(order, newStatus, ctx);
  if (msgs) {
    try {
      await prisma.notification.create({
        data: {
          userId: order.customerId,
          type: 'ORDER_STATUS',
          title: msgs.titleAr,
          titleAr: msgs.titleAr,
          body: msgs.bodyAr,
          bodyAr: msgs.bodyAr,
          channel: msgs.channel,
          data: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            status: newStatus,
          },
        },
      });
    } catch (err) {
      logger.warn({ err, orderId: order.id }, 'failed to persist customer notification');
    }
  }

  // 3. FCM push to the customer (graceful no-op when FCM isn't configured)
  if (msgs) {
    try {
      await sendPushToUser(order.customerId, {
        title: msgs.titleAr,
        body: msgs.bodyAr,
        data: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: newStatus,
        },
      });
    } catch (err) {
      logger.warn({ err, orderId: order.id }, 'FCM push failed');
    }
  }

  // 4. WhatsApp fan-out — 4 distinct recipients, each on a focused 4-stage
  //    cadence so nobody gets spammed. Each block is independent so one
  //    failing recipient never blocks the others.

  // 4a. Customer — only fires on the 4 major-stage transitions (handled by
  //     messagesFor returning customerWhatsappBody on NEW/ACCEPTED/PICKED_UP/
  //     DELIVERED) plus the CANCELLED/REJECTED exceptions.
  if (msgs?.customerWhatsappBody) {
    try {
      const customer = await prisma.user.findUnique({
        where: { id: order.customerId },
        select: { phone: true },
      });
      if (customer?.phone) {
        const sent = await sendWhatsAppMessage({
          toPhone: customer.phone,
          text: msgs.customerWhatsappBody,
        });
        if (sent) {
          await prisma.order.update({
            where: { id: order.id },
            data: { whatsappSentAt: new Date() },
          });
        }
      }
    } catch (err) {
      logger.warn({ err, orderId: order.id }, 'customer whatsapp failed');
    }
  }

  // 4b. Merchant — only on NEW + DELIVERED (and only when the order has a
  //     merchant attached, which means it's a marketplace order).
  const merchantText = merchantWhatsappFor(order, newStatus);
  if (merchantText && order.merchantId) {
    try {
      const merchantProfile = await prisma.merchantProfile.findUnique({
        where: { id: order.merchantId },
        select: { user: { select: { phone: true } } },
      });
      const phone = merchantProfile?.user?.phone;
      if (phone) {
        await sendWhatsAppMessage({ toPhone: phone, text: merchantText });
      }
    } catch (err) {
      logger.warn({ err, orderId: order.id }, 'merchant whatsapp failed');
    }
  }

  // 4c. Driver — only on DRIVER_ASSIGNED.
  const driverText = driverWhatsappFor(order, newStatus);
  if (driverText && order.assignedDriverId) {
    try {
      const driver = await prisma.user.findUnique({
        where: { id: order.assignedDriverId },
        select: { phone: true },
      });
      if (driver?.phone) {
        await sendWhatsAppMessage({ toPhone: driver.phone, text: driverText });
      }
    } catch (err) {
      logger.warn({ err, orderId: order.id }, 'driver whatsapp failed');
    }
  }

  // 4d. Admin — only on NEW. Sends to the configured business number so
  //     whoever's on duty sees every fresh order. Gracefully no-ops if the
  //     env var isn't set.
  const adminText = adminWhatsappFor(order, newStatus, ctx);
  if (adminText && env.WHATSAPP_BUSINESS_NUMBER) {
    try {
      await sendWhatsAppMessage({
        toPhone: env.WHATSAPP_BUSINESS_NUMBER,
        text: adminText,
      });
    } catch (err) {
      logger.warn({ err, orderId: order.id }, 'admin whatsapp failed');
    }
  }

  // 4e. Supervisor on shift — only fires on NEW so the duty supervisor sees
  //     every fresh order on their WhatsApp. notifyOnShiftSupervisor catches
  //     its own errors internally so a missing supervisor or a WhatsApp
  //     outage never propagates to the order pipeline.
  if (newStatus === 'NEW') {
    await notifyOnShiftSupervisor(order, ctx);
  }

  // 5. Notify the driver too on assignment so they see a "new ride" message
  if (newStatus === 'DRIVER_ASSIGNED' && order.assignedDriverId) {
    try {
      await prisma.notification.create({
        data: {
          userId: order.assignedDriverId,
          type: 'ORDER_STATUS',
          title: 'New delivery assigned',
          titleAr: 'تم تعيينك على توصيل',
          body: `Order ${order.orderNumber} assigned to you`,
          bodyAr: `الطلب ${order.orderNumber} مسند إليك. افتح التطبيق للتفاصيل.`,
          channel: 'IN_APP',
          data: { orderId: order.id, orderNumber: order.orderNumber },
        },
      });
      // FCM push for the driver too (silent no-op if no token).
      await sendPushToUser(order.assignedDriverId, {
        title: 'تم تعيينك على توصيل',
        body: `الطلب ${order.orderNumber} مسند إليك`,
        data: { orderId: order.id, orderNumber: order.orderNumber },
      });
    } catch (err) {
      logger.warn({ err }, 'driver notification failed');
    }
  }

  logger.debug(
    { orderId: order.id, status: newStatus, label: ORDER_STATUS_AR[newStatus] },
    'order status side-effects dispatched',
  );
}
