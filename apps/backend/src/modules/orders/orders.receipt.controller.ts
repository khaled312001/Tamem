import type { Prisma } from '@prisma/client';
import type { RequestHandler } from 'express';

import { UserRole } from '@tamem/types';

import { prisma } from '../../db/prisma.js';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../../utils/errors.js';
import { ok } from '../../utils/response.js';

/**
 * Receipt / invoice endpoints.
 *
 *   GET /orders/:id/receipt      → printable HTML invoice (Arabic RTL, brand red).
 *                                  Used by the WhatsApp share link so the customer
 *                                  or anyone they forward it to can open the URL
 *                                  in a browser and see / save / print it.
 *   GET /orders/:id/receipt.json → same payload as JSON. The mobile app links
 *                                  here so it can render natively (and so we
 *                                  don't have to ship an HTML renderer in RN).
 *
 * Authorization mirrors `getMine`: the customer can only see their own order;
 * admin sees any. We do NOT widen access for sub-orders — if a parent order
 * is requested, the parent's customer sees the whole tree.
 */

const param = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new NotFoundError('Resource');
  return v;
};

const receiptInclude = {
  service: true,
  items: true,
  payments: { orderBy: { createdAt: 'asc' } },
  customer: {
    select: { id: true, name: true, phone: true },
  },
  assignedDriver: { select: { id: true, name: true, phone: true } },
  couponRedemption: {
    include: { coupon: { select: { code: true, type: true, value: true } } },
  },
} satisfies Prisma.OrderInclude;

type ReceiptOrder = Prisma.OrderGetPayload<{ include: typeof receiptInclude }>;

interface ReceiptPayload {
  orderNumber: string;
  status: string;
  createdAt: string;
  customer: { name: string; phone: string };
  service: { nameAr: string; category: string };
  deliveryAddress: string | null;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number | null;
    lineTotal: number | null;
    notes: string | null;
  }>;
  subtotal: number | null;
  discount: { code: string; amount: number } | null;
  walletUsed: number | null;
  finalPrice: number | null;
  currency: string;
  paymentMethod: string | null;
  paymentStatus: string;
  driver: { name: string; phone: string } | null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toPayload(order: ReceiptOrder): ReceiptPayload {
  const items = order.items.map((it) => {
    const unit = num(it.unitPriceSnapshot);
    return {
      name: it.productNameSnapshot,
      quantity: it.quantity,
      unitPrice: unit,
      lineTotal: unit !== null ? Math.round(unit * it.quantity * 100) / 100 : null,
      notes: it.notes,
    };
  });

  // Prefer the explicit merchantSubtotal; otherwise derive from line items so
  // legacy orders (and DELIVERY/SHIPPING orders without items) still surface
  // a meaningful number.
  let subtotal: number | null = num(order.merchantSubtotal);
  if (subtotal === null) {
    const itemsTotal = items.reduce((sum, it) => sum + (it.lineTotal ?? 0), 0);
    subtotal = items.length > 0 && itemsTotal > 0 ? Math.round(itemsTotal * 100) / 100 : null;
  }
  if (subtotal === null) {
    subtotal = num(order.quotedPrice);
  }

  const discountAmount = num(order.discountAmount);
  const discount =
    discountAmount && discountAmount > 0 && order.couponCode
      ? { code: order.couponCode, amount: discountAmount }
      : null;

  return {
    orderNumber: order.orderNumber,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    customer: {
      name: order.customer.name,
      phone: order.customer.phone,
    },
    service: {
      nameAr: order.service.nameAr,
      category: order.service.category,
    },
    deliveryAddress: order.deliveryAddress ?? null,
    items,
    subtotal,
    discount,
    walletUsed: num(order.walletUsed),
    finalPrice: num(order.finalPrice) ?? num(order.quotedPrice),
    currency: order.currency,
    paymentMethod: order.paymentMethod ?? null,
    paymentStatus: order.paymentStatus,
    driver: order.assignedDriver
      ? { name: order.assignedDriver.name, phone: order.assignedDriver.phone }
      : null,
  };
}

async function loadReceipt(
  orderId: string,
  user: { id: string; role: UserRole },
): Promise<ReceiptOrder> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: receiptInclude,
  });
  if (!order) throw new NotFoundError('Order', 'الطلب غير موجود');
  if (order.customerId !== user.id && user.role !== UserRole.ADMIN) {
    throw new ForbiddenError('لا تستطيع عرض هذه الفاتورة');
  }
  return order;
}

// ───────────────────────────── HTML rendering ──────────────────────────────

const BRAND = '#E0301E';

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const PAYMENT_LABEL_AR: Record<string, string> = {
  CASH: 'كاش عند الاستلام',
  VODAFONE_CASH: 'فودافون كاش',
  INSTAPAY: 'إنستاباي',
};

const STATUS_LABEL_AR: Record<string, string> = {
  NEW: 'جديد',
  UNDER_REVIEW: 'قيد المراجعة',
  PRICED: 'تم التسعير',
  AWAITING_CUSTOMER_APPROVAL: 'بانتظار موافقتك',
  ACCEPTED: 'مقبول',
  DRIVER_ASSIGNED: 'تم تعيين مندوب',
  PICKED_UP: 'تم الاستلام',
  IN_ROUTE: 'في الطريق',
  DELIVERED: 'تم التوصيل',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي',
  REJECTED: 'مرفوض',
};

function fmtMoney(amount: number | null, currency: string): string {
  if (amount === null) return '—';
  return `${amount.toFixed(2)} ${currency}`;
}

function fmtDateAr(iso: string): string {
  const d = new Date(iso);
  // Always render in a stable Arabic-Egypt locale, server-side — the HTML
  // is meant to look identical regardless of who opens the share link.
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function renderReceiptHtml(p: ReceiptPayload): string {
  const itemsRows =
    p.items.length === 0
      ? `<tr><td colspan="4" class="muted center">لا توجد أصناف مفصّلة لهذا الطلب</td></tr>`
      : p.items
          .map(
            (it) => `
            <tr>
              <td>${escapeHtml(it.name)}${
                it.notes ? `<div class="muted small">${escapeHtml(it.notes)}</div>` : ''
              }</td>
              <td class="center">${it.quantity}</td>
              <td class="end">${fmtMoney(it.unitPrice, p.currency)}</td>
              <td class="end">${fmtMoney(it.lineTotal, p.currency)}</td>
            </tr>`,
          )
          .join('');

  const totalsRows: string[] = [];
  if (p.subtotal !== null) {
    totalsRows.push(
      `<tr><td>المجموع الفرعي</td><td class="end">${fmtMoney(p.subtotal, p.currency)}</td></tr>`,
    );
  }
  if (p.discount) {
    totalsRows.push(
      `<tr class="discount"><td>خصم (${escapeHtml(p.discount.code)})</td><td class="end">- ${fmtMoney(
        p.discount.amount,
        p.currency,
      )}</td></tr>`,
    );
  }
  if (p.walletUsed && p.walletUsed > 0) {
    totalsRows.push(
      `<tr class="discount"><td>المحفظة</td><td class="end">- ${fmtMoney(p.walletUsed, p.currency)}</td></tr>`,
    );
  }
  totalsRows.push(
    `<tr class="final"><td>الإجمالي</td><td class="end">${fmtMoney(p.finalPrice, p.currency)}</td></tr>`,
  );

  const driverBlock = p.driver
    ? `
      <section class="card">
        <h2>المندوب</h2>
        <div class="row"><span class="label">الاسم</span><span>${escapeHtml(p.driver.name)}</span></div>
        <div class="row"><span class="label">الهاتف</span><span dir="ltr">${escapeHtml(p.driver.phone)}</span></div>
      </section>`
    : '';

  const deliveryBlock = p.deliveryAddress
    ? `<div class="row"><span class="label">عنوان التوصيل</span><span>${escapeHtml(p.deliveryAddress)}</span></div>`
    : '';

  const paymentLabel = p.paymentMethod
    ? (PAYMENT_LABEL_AR[p.paymentMethod] ?? p.paymentMethod)
    : '—';
  const statusLabel = STATUS_LABEL_AR[p.status] ?? p.status;

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>فاتورة ${escapeHtml(p.orderNumber)} — تمام</title>
<style>
  :root { --brand: ${BRAND}; }
  * { box-sizing: border-box; }
  body {
    font-family: "Cairo", "Tajawal", "Segoe UI", Tahoma, Arial, sans-serif;
    background: #f4f4f4;
    color: #222;
    margin: 0;
    padding: 24px;
    line-height: 1.6;
  }
  .invoice {
    max-width: 720px;
    margin: 0 auto;
    background: #fff;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  }
  .header {
    background: var(--brand);
    color: #fff;
    padding: 24px 28px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
  }
  .header h1 { margin: 0; font-size: 22px; letter-spacing: 0.5px; }
  .header .number { font-size: 14px; opacity: 0.95; }
  .header .badge {
    background: rgba(255,255,255,0.18);
    border: 1px solid rgba(255,255,255,0.35);
    padding: 4px 12px;
    border-radius: 999px;
    font-size: 13px;
  }
  .body { padding: 24px 28px; }
  .card {
    border: 1px solid #ececec;
    border-radius: 10px;
    padding: 16px 18px;
    margin-bottom: 16px;
    background: #fafafa;
  }
  .card h2 {
    margin: 0 0 12px;
    font-size: 15px;
    color: var(--brand);
    border-bottom: 1px solid #eee;
    padding-bottom: 6px;
  }
  .row { display: flex; justify-content: space-between; gap: 16px; padding: 4px 0; }
  .row .label { color: #666; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { padding: 10px 8px; border-bottom: 1px solid #eee; text-align: start; vertical-align: top; }
  th { background: #fff5f4; color: var(--brand); font-weight: 600; font-size: 13px; }
  td.center, th.center { text-align: center; }
  td.end, th.end { text-align: end; }
  .muted { color: #999; }
  .small { font-size: 12px; }
  .totals { margin-top: 8px; }
  .totals td { border-bottom: 1px dashed #eee; padding: 8px 4px; }
  .totals tr.discount td { color: #2a8f3f; }
  .totals tr.final td {
    border-top: 2px solid var(--brand);
    border-bottom: none;
    font-weight: 700;
    font-size: 16px;
    color: var(--brand);
    padding-top: 12px;
  }
  .footer {
    text-align: center;
    color: #999;
    font-size: 12px;
    padding: 16px;
    border-top: 1px solid #f0f0f0;
  }
  @media print {
    body { background: #fff; padding: 0; }
    .invoice { box-shadow: none; }
  }
</style>
</head>
<body>
  <div class="invoice">
    <div class="header">
      <div>
        <h1>تمام — فاتورة طلب</h1>
        <div class="number">رقم الطلب: ${escapeHtml(p.orderNumber)}</div>
      </div>
      <span class="badge">${escapeHtml(statusLabel)}</span>
    </div>
    <div class="body">
      <section class="card">
        <h2>تفاصيل الطلب</h2>
        <div class="row"><span class="label">الخدمة</span><span>${escapeHtml(p.service.nameAr)}</span></div>
        <div class="row"><span class="label">التاريخ</span><span>${escapeHtml(fmtDateAr(p.createdAt))}</span></div>
        ${deliveryBlock}
      </section>

      <section class="card">
        <h2>بيانات العميل</h2>
        <div class="row"><span class="label">الاسم</span><span>${escapeHtml(p.customer.name)}</span></div>
        <div class="row"><span class="label">الهاتف</span><span dir="ltr">${escapeHtml(p.customer.phone)}</span></div>
      </section>

      ${driverBlock}

      <section class="card">
        <h2>الأصناف</h2>
        <table>
          <thead>
            <tr>
              <th>الصنف</th>
              <th class="center">الكمية</th>
              <th class="end">السعر</th>
              <th class="end">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>الحساب</h2>
        <table class="totals">
          ${totalsRows.join('\n          ')}
        </table>
        <div class="row" style="margin-top:12px"><span class="label">طريقة الدفع</span><span>${escapeHtml(paymentLabel)}</span></div>
      </section>
    </div>
    <div class="footer">شكراً لاستخدامك تطبيق تمام</div>
  </div>
</body>
</html>`;
}

// ───────────────────────────── Handlers ────────────────────────────────────

/**
 * GET /orders/:id/receipt — HTML invoice. Designed for WhatsApp share links
 * so the recipient can open it directly in a browser without an app.
 */
export const getReceiptHtml: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const order = await loadReceipt(param(req.params.id), req.user);
    const html = renderReceiptHtml(toPayload(order));
    res.type('html').send(html);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /orders/:id/receipt.json — same data the HTML view shows, but as a
 * plain JSON object so the mobile app can render natively.
 */
export const getReceiptJson: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const order = await loadReceipt(param(req.params.id), req.user);
    ok(res, toPayload(order));
  } catch (err) {
    next(err);
  }
};
