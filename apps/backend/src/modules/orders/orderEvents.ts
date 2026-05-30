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

import { prisma } from '../../db/prisma.js';
import { sendWhatsAppMessage } from '../../integrations/whatsapp.js';
import { emitOrderStatusChange } from '../../realtime/channels.js';
import { logger } from '../../utils/logger.js';

type NotifChannel = 'IN_APP' | 'WHATSAPP' | 'PUSH';

interface StatusMessages {
  titleAr: string;
  bodyAr: string;
  channel: NotifChannel;
  whatsapp?: boolean;
}

function messagesFor(order: Order, status: OrderStatus): StatusMessages | null {
  const num = order.orderNumber;
  const price = order.quotedPrice ? `${order.quotedPrice} ج.م` : '';
  const sig = '\n\n— تميم للتوصيل';

  switch (status) {
    case 'NEW':
      return {
        titleAr: '✓ تم استلام طلبك',
        bodyAr:
          `أهلاً بك في تميم 👋\n` +
          `استلمنا طلبك رقم ${num} بنجاح.\n` +
          `هتوصلك رسالة تأكيد تانية بمجرد ما الإدارة تراجع الطلب وتسعّره (خلال دقائق).` +
          sig,
        channel: 'IN_APP',
        whatsapp: true,
      };
    case 'UNDER_REVIEW':
      return {
        titleAr: '🔍 طلبك قيد المراجعة',
        bodyAr: `طلب ${num} قيد المراجعة.\n` + `الفريق بيتحقق من التفاصيل ويسعّره الآن.` + sig,
        channel: 'IN_APP',
        whatsapp: true,
      };
    case 'PRICED':
      return {
        titleAr: '💰 تم تسعير طلبك',
        bodyAr:
          `طلب ${num} جاهز.\n` +
          `💵 السعر: ${price}\n\n` +
          `افتح التطبيق ووافق على السعر للبدء فوراً.` +
          sig,
        channel: 'IN_APP',
        whatsapp: true,
      };
    case 'AWAITING_CUSTOMER_APPROVAL':
      return {
        titleAr: '⏳ بانتظار موافقتك',
        bodyAr:
          `طلب ${num} في انتظار موافقتك.\n` +
          (price ? `💵 السعر النهائي: ${price}\n\n` : '\n') +
          `افتح التطبيق ووافق علشان نبدأ التجهيز.` +
          sig,
        channel: 'IN_APP',
        whatsapp: true,
      };
    case 'ACCEPTED':
      return {
        titleAr: '✅ تم قبول الطلب',
        bodyAr:
          `شكراً ليك 🎉\n` +
          `طلب ${num} تم قبوله، هنبدأ تجهيزه فوراً وندوّر على مندوب مناسب.` +
          sig,
        channel: 'IN_APP',
        whatsapp: true,
      };
    case 'DRIVER_ASSIGNED':
      return {
        titleAr: '🛵 تم تعيين السائق',
        bodyAr: `طلب ${num} في طريقه إليك.\n` + `المندوب هيكلمك قريباً جداً.` + sig,
        channel: 'IN_APP',
        whatsapp: true,
      };
    case 'PICKED_UP':
      return {
        titleAr: '📦 تم استلام الطلب',
        bodyAr: `المندوب استلم طلب ${num} وبدأ التحرك ليك.\n` + `استعد للاستلام خلال دقايق.` + sig,
        channel: 'IN_APP',
        whatsapp: true,
      };
    case 'IN_ROUTE':
      return {
        titleAr: '🚀 الطلب في الطريق',
        bodyAr: `طلب ${num} وصل لمنطقتك.\n` + `جهّز التواجد عند العنوان من فضلك.` + sig,
        channel: 'IN_APP',
        whatsapp: true,
      };
    case 'DELIVERED':
      return {
        titleAr: '🎁 تم تسليم الطلب',
        bodyAr:
          `تم تسليم طلب ${num} بنجاح.\n` + `شكراً لاختيارك تميم 🙏 — قيّم تجربتك من التطبيق.` + sig,
        channel: 'IN_APP',
        whatsapp: true,
      };
    case 'COMPLETED':
      return {
        titleAr: '⭐ تم إكمال الطلب',
        bodyAr: `طلب ${num} مكتمل بالكامل.\n` + `نتمنى أن نخدمك مرة أخرى قريباً 💛` + sig,
        channel: 'IN_APP',
        whatsapp: true,
      };
    case 'CANCELLED':
      return {
        titleAr: '🚫 تم إلغاء الطلب',
        bodyAr:
          `تم إلغاء طلب ${num}.` +
          (order.cancellationReason ? `\nالسبب: ${order.cancellationReason}` : '') +
          `\n\nلو فيه أي استفسار، تواصل معنا.` +
          sig,
        channel: 'IN_APP',
        whatsapp: true,
      };
    case 'REJECTED':
      return {
        titleAr: '❌ تعذّر تنفيذ الطلب',
        bodyAr:
          `للأسف ما قدرناش ننفذ طلب ${num}.` +
          (order.cancellationReason ? `\nالسبب: ${order.cancellationReason}` : '') +
          `\n\nنعتذر، تواصل معنا للتفاصيل.` +
          sig,
        channel: 'IN_APP',
        whatsapp: true,
      };
    default:
      return null;
  }
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

  // 2. In-app notification for the customer
  const msgs = messagesFor(order, newStatus);
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

  // 3. WhatsApp server-side dispatch (optional — gracefully no-ops if not configured)
  if (msgs?.whatsapp) {
    try {
      const customer = await prisma.user.findUnique({
        where: { id: order.customerId },
        select: { phone: true, name: true },
      });
      if (customer?.phone) {
        const sent = await sendWhatsAppMessage({
          toPhone: customer.phone,
          text: msgs.bodyAr,
        });
        if (sent) {
          await prisma.order.update({
            where: { id: order.id },
            data: { whatsappSentAt: new Date() },
          });
        }
      }
    } catch (err) {
      logger.warn({ err, orderId: order.id }, 'whatsapp dispatch failed');
    }
  }

  // 4. Notify the driver too on assignment so they see a "new ride" message
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
    } catch (err) {
      logger.warn({ err }, 'driver notification failed');
    }
  }

  logger.debug(
    { orderId: order.id, status: newStatus, label: ORDER_STATUS_AR[newStatus] },
    'order status side-effects dispatched',
  );
}
