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
  switch (status) {
    case 'UNDER_REVIEW':
      return {
        titleAr: 'طلبك قيد المراجعة',
        bodyAr: `استلمنا طلبك ${num} وجاري المراجعة.`,
        channel: 'IN_APP',
        whatsapp: true,
      };
    case 'PRICED':
      return {
        titleAr: 'تم تسعير طلبك',
        bodyAr: `طلب ${num} تم تسعيره بـ ${price}. ادخل التطبيق للموافقة.`,
        channel: 'IN_APP',
        whatsapp: true,
      };
    case 'AWAITING_CUSTOMER_APPROVAL':
      return {
        titleAr: 'بانتظار موافقتك',
        bodyAr: `طلب ${num} جاهز — برجاء الموافقة من التطبيق لبدء التنفيذ.`,
        channel: 'IN_APP',
        whatsapp: true,
      };
    case 'ACCEPTED':
      return {
        titleAr: 'تم قبول الطلب',
        bodyAr: `طلب ${num} تم قبوله. هنبدأ التجهيز فوراً.`,
        channel: 'IN_APP',
        whatsapp: true,
      };
    case 'DRIVER_ASSIGNED':
      return {
        titleAr: 'تم تعيين سائق',
        bodyAr: `طلب ${num} في طريقه — السائق سيتواصل معك قريباً.`,
        channel: 'IN_APP',
        whatsapp: true,
      };
    case 'PICKED_UP':
      return {
        titleAr: 'تم استلام طلبك',
        bodyAr: `استلم السائق طلب ${num} وفي الطريق إليك.`,
        channel: 'IN_APP',
        whatsapp: true,
      };
    case 'IN_ROUTE':
      return {
        titleAr: 'الطلب في الطريق',
        bodyAr: `طلب ${num} وصل لمنطقتك قريباً.`,
        channel: 'IN_APP',
        whatsapp: true,
      };
    case 'DELIVERED':
      return {
        titleAr: 'تم تسليم الطلب',
        bodyAr: `طلب ${num} تم تسليمه — شكراً لاختيارك تميم.`,
        channel: 'IN_APP',
        whatsapp: true,
      };
    case 'COMPLETED':
      return {
        titleAr: 'تم إكمال الطلب',
        bodyAr: `طلب ${num} مكتمل. نتمنى أن نخدمك مرة أخرى.`,
        channel: 'IN_APP',
        whatsapp: true,
      };
    case 'CANCELLED':
      return {
        titleAr: 'تم إلغاء الطلب',
        bodyAr: `تم إلغاء طلب ${num}.${order.cancellationReason ? ` السبب: ${order.cancellationReason}` : ''}`,
        channel: 'IN_APP',
        whatsapp: true,
      };
    case 'REJECTED':
      return {
        titleAr: 'تم رفض الطلب',
        bodyAr: `للأسف لم نتمكن من تنفيذ طلب ${num}. تواصل معنا للتفاصيل.`,
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
