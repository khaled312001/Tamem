import type { RequestHandler } from 'express';

import { prisma } from '../../db/prisma.js';
import { NotFoundError } from '../../utils/errors.js';
import { ok } from '../../utils/response.js';

interface TimelineEntry {
  id: string;
  kind: 'status' | 'note' | 'whatsapp' | 'payment' | 'review' | 'alert';
  title: string;
  body?: string | null;
  author?: string;
  at: string;
}

/**
 * GET /admin/orders/:id/timeline — single chronological feed combining every
 * touchpoint the admin needs to debug an order: status changes, internal
 * notes, WhatsApp dispatches, payment events, review, alerts. Sorted oldest
 * → newest so it reads top-to-bottom.
 */
export const getOrderTimeline: RequestHandler = async (req, res, next) => {
  try {
    const orderId = req.params.id;
    if (typeof orderId !== 'string' || !orderId) throw new NotFoundError('Order');
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        whatsappSentAt: true,
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          include: { changedBy: { select: { name: true, role: true } } },
        },
        payments: { orderBy: { createdAt: 'asc' } },
        review: true,
        alerts: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) throw new NotFoundError('Order', 'الطلب غير موجود');

    const entries: TimelineEntry[] = [];

    entries.push({
      id: `created-${order.id}`,
      kind: 'status',
      title: 'تم إنشاء الطلب',
      at: order.createdAt.toISOString(),
    });

    for (const h of order.statusHistory) {
      const isNote =
        h.metadata && typeof h.metadata === 'object' && 'kind' in (h.metadata as object)
          ? (h.metadata as { kind?: string }).kind === 'NOTE'
          : false;
      entries.push({
        id: h.id,
        kind: isNote ? 'note' : 'status',
        title: isNote
          ? `ملاحظة داخلية بواسطة ${h.changedBy?.name ?? 'مدير'}`
          : `تغيرت الحالة ← ${h.toStatus}`,
        body: h.reason,
        author: h.changedBy?.name,
        at: h.createdAt.toISOString(),
      });
    }

    if (order.whatsappSentAt) {
      entries.push({
        id: `wa-${order.id}`,
        kind: 'whatsapp',
        title: 'تم إرسال رسالة واتساب',
        at: order.whatsappSentAt.toISOString(),
      });
    }

    for (const p of order.payments) {
      entries.push({
        id: `pay-create-${p.id}`,
        kind: 'payment',
        title: `دفعة (${p.method}) — ${p.amount} ج.م`,
        body: p.referenceNumber ? `مرجع: ${p.referenceNumber}` : null,
        at: p.createdAt.toISOString(),
      });
      if (p.confirmedAt) {
        entries.push({
          id: `pay-conf-${p.id}`,
          kind: 'payment',
          title: 'تم تأكيد الدفعة',
          at: p.confirmedAt.toISOString(),
        });
      }
      if (p.refundedAt) {
        entries.push({
          id: `pay-ref-${p.id}`,
          kind: 'payment',
          title: `استرداد دفعة — ${p.refundAmount ?? 0} ج.م`,
          body: p.refundReason,
          at: p.refundedAt.toISOString(),
        });
      }
    }

    if (order.review) {
      entries.push({
        id: order.review.id,
        kind: 'review',
        title: `العميل قيّم الطلب ⭐ ${order.review.rating}/5`,
        body: order.review.comment,
        at: order.review.createdAt.toISOString(),
      });
    }

    for (const a of order.alerts) {
      entries.push({
        id: a.id,
        kind: 'alert',
        title: `🚨 ${a.titleAr}`,
        body: a.descriptionAr,
        at: a.createdAt.toISOString(),
      });
    }

    entries.sort((a, b) => a.at.localeCompare(b.at));
    ok(res, entries);
  } catch (err) {
    next(err);
  }
};
