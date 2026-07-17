/**
 * CSV export for the revenue report. Excel opens CSV natively, so we get
 * "Excel export" without pulling in `exceljs` (which would require an
 * install and adds ~5MB to the bundle).
 *
 * For PDF, we let the dashboard handle it via `window.print()` against a
 * print-friendly stylesheet — `pdfkit` server-side would be heavier and
 * less flexible than browser print.
 *
 * The CSV is UTF-8 with BOM so Excel auto-detects Arabic encoding.
 */
import type { RequestHandler } from 'express';
import { z } from 'zod';

import { queryBoolDefault } from '../../utils/zodBool.js';

import { loadReport } from './revenue.controller.js';

const querySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  preset: z.enum(['today', 'week', 'month', 'custom']).default('custom'),
  merchantId: z.string().optional(),
  paymentMethod: z.enum(['CASH', 'VODAFONE_CASH', 'INSTAPAY']).optional(),
  status: z.enum(['COMPLETED', 'DELIVERED', 'ALL_REVENUE']).default('COMPLETED'),
  includeCommission: queryBoolDefault(false),
  commissionPctOverride: z.coerce.number().min(0).max(100).optional(),
});

/** Escape a field for safe inclusion in a CSV row. */
function csvField(v: string | number | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  // Quote when the field contains commas, quotes, or newlines.
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ar-EG', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const STATUS_AR: Record<string, string> = {
  COMPLETED: 'مكتمل',
  DELIVERED: 'تم التوصيل',
  CANCELLED: 'ملغي',
  REJECTED: 'مرفوض',
};

const PAYMENT_AR: Record<string, string> = {
  CASH: 'كاش',
  VODAFONE_CASH: 'فودافون كاش',
  INSTAPAY: 'إنستاباي',
};

/** GET /admin/reports/revenue.csv — Excel-compatible CSV download. */
export const revenueCsv: RequestHandler = async (req, res, next) => {
  try {
    const q = querySchema.parse(req.query);
    const payload = await loadReport(q);

    const headers = [
      'رقم الطلب',
      'تاريخ',
      'العميل',
      'الهاتف',
      'التاجر',
      'الخدمة',
      'الفئة',
      'الحالة',
      'الدفع',
      'قيمة التاجر',
      'رسوم التوصيل',
      'عمولة التطبيق',
      'الخصم',
      'استخدام المحفظة',
      'الإجمالي',
      'صافي للتاجر',
      'صافي لتميم',
    ];

    const lines: string[] = [];
    lines.push(headers.map(csvField).join(','));

    for (const r of payload.rows) {
      lines.push(
        [
          r.orderNumber,
          fmtDate(r.completedAt),
          r.customerName,
          r.customerPhone,
          r.merchantName ?? '—',
          r.serviceNameAr,
          r.category,
          STATUS_AR[r.status] ?? r.status,
          PAYMENT_AR[r.paymentMethod] ?? r.paymentMethod,
          r.merchantSubtotal.toFixed(2),
          r.deliveryFee.toFixed(2),
          r.platformCommission.toFixed(2),
          r.discountAmount.toFixed(2),
          r.walletUsed.toFixed(2),
          r.finalPrice.toFixed(2),
          r.merchantPayout.toFixed(2),
          r.tamemNet.toFixed(2),
        ]
          .map(csvField)
          .join(','),
      );
    }

    // Summary block at the bottom for the accountant's eyes.
    lines.push('');
    lines.push(csvField('الملخص'));
    lines.push(['عدد الطلبات', payload.summary.ordersCount].map(csvField).join(','));
    lines.push(['إجمالي المبيعات', payload.summary.totalSales.toFixed(2)].map(csvField).join(','));
    lines.push(
      ['إجمالي رسوم التوصيل', payload.summary.totalDeliveryFees.toFixed(2)].map(csvField).join(','),
    );
    lines.push(
      ['إجمالي عمولة التطبيق', payload.summary.totalCommission.toFixed(2)].map(csvField).join(','),
    );
    lines.push(
      ['إجمالي الخصومات', payload.summary.totalDiscounts.toFixed(2)].map(csvField).join(','),
    );
    lines.push(
      ['إجمالي مستحقات التجار', payload.summary.totalMerchantPayouts.toFixed(2)]
        .map(csvField)
        .join(','),
    );
    lines.push(
      ['صافي إيرادات تميم', payload.summary.totalTamemNet.toFixed(2)].map(csvField).join(','),
    );
    lines.push(
      ['صافي الإيرادات', payload.summary.totalNetRevenue.toFixed(2)].map(csvField).join(','),
    );

    // UTF-8 BOM + CRLF so Excel opens Arabic correctly.
    const body = '﻿' + lines.join('\r\n');
    const filename = `tamem-revenue-${payload.range.from.slice(0, 10)}_to_${payload.range.to.slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(body);
  } catch (err) {
    next(err);
  }
};
