/**
 * Detailed accountant-grade revenue report.
 *
 * Returns enough breakdown so the accountant can:
 *   1. See totals per period
 *   2. See per-merchant sales + commission + payout
 *   3. See every order line with merchant + customer + breakdown
 *   4. Filter by date range + merchant + payment method
 *   5. Export the result to PDF or Excel (separate endpoint, shared `loadRows`)
 *
 * Money math invariants (computed per row):
 *   merchantSubtotal   = base price the merchant earns
 *   deliveryFee        = ride fee customer paid
 *   platformCommission = Tamem's cut from merchantSubtotal
 *   discountAmount     = coupon discount applied
 *   walletUsed         = wallet credit applied
 *   merchantPayout     = merchantSubtotal − platformCommission
 *   netRevenue         = finalPrice − discountAmount − walletUsed  (what the
 *                        platform actually collected from the customer)
 *   tamemNet           = platformCommission + deliveryFee
 *                        (Tamem's slice of the pie)
 *
 * Legacy orders with no fee breakdown are still included; the unrecorded
 * fields are estimated using the merchant's `commissionPct` default so the
 * totals stay coherent. We flag estimated rows so the accountant knows
 * which numbers are derived vs. recorded.
 */
import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { ok } from '../../utils/response.js';

const DEFAULT_COMMISSION_PCT = 15; // % — falls back when the merchant has no override

const querySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /** Convenience preset — shifts from/to to a fixed window. */
  preset: z.enum(['today', 'week', 'month', 'custom']).default('custom'),
  merchantId: z.string().optional(),
  paymentMethod: z.enum(['CASH', 'VODAFONE_CASH', 'INSTAPAY']).optional(),
  status: z.enum(['COMPLETED', 'DELIVERED', 'ALL_REVENUE']).default('COMPLETED'),
  /** When false, set platformCommission=0 on every row.
   *
   *  Defaults OFF: Tamem isn't charging a percentage today, so defaulting it on
   *  reported commission nobody collected and shrank every merchant payout by
   *  15%. The admin opts in from the report's own toggle. */
  includeCommission: z.coerce.boolean().default(false),
  /** Override the per-merchant default commission %. Null = use each
   *  merchant's own setting (or the platform fallback). */
  commissionPctOverride: z.coerce.number().min(0).max(100).optional(),
});

export interface ReportRow {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  merchantId: string | null;
  merchantName: string | null;
  category: string;
  serviceNameAr: string;
  completedAt: string;
  status: string;
  paymentMethod: string;
  // Money breakdown
  merchantSubtotal: number;
  deliveryFee: number;
  platformCommission: number;
  discountAmount: number;
  walletUsed: number;
  finalPrice: number;
  merchantPayout: number;
  tamemNet: number;
  netRevenue: number;
  /** When true, some fees were estimated from defaults (legacy order). */
  estimated: boolean;
}

export interface ReportSummary {
  ordersCount: number;
  totalSales: number;
  totalDeliveryFees: number;
  totalCommission: number;
  totalDiscounts: number;
  totalWalletUsed: number;
  totalMerchantPayouts: number;
  totalTamemNet: number;
  totalNetRevenue: number;
}

export interface ReportPayload {
  summary: ReportSummary;
  byMerchant: Array<{
    merchantId: string | null;
    merchantName: string;
    ordersCount: number;
    sales: number;
    commission: number;
    payout: number;
  }>;
  byPaymentMethod: Array<{
    paymentMethod: string;
    ordersCount: number;
    sales: number;
  }>;
  rows: ReportRow[];
  range: { from: string; to: string };
  generatedAt: string;
}

function resolveRange(preset: string, from?: Date, to?: Date): { from: Date; to: Date } {
  const now = new Date();
  if (preset === 'today') {
    const f = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { from: f, to: now };
  }
  if (preset === 'week') {
    return { from: new Date(now.getTime() - 7 * 86_400_000), to: now };
  }
  if (preset === 'month') {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
  }
  return {
    from: from ?? new Date(now.getTime() - 30 * 86_400_000),
    to: to ?? now,
  };
}

/**
 * Pull the underlying order rows + compute per-row breakdown. Exposed so
 * the PDF/Excel exporters can reuse the same data shape without re-running
 * the entire calculation.
 */
export async function loadReport(q: z.infer<typeof querySchema>): Promise<ReportPayload> {
  const { from, to } = resolveRange(q.preset, q.from, q.to);

  const statusFilter =
    q.status === 'ALL_REVENUE'
      ? { in: ['COMPLETED' as const, 'DELIVERED' as const] }
      : (q.status as 'COMPLETED' | 'DELIVERED');

  // Pull ALL orders in the period, regardless of whether finalPrice or
  // quotedPrice was set — we'll fall back to whichever is present. Also
  // accept orders that finished inside the range OR were just created in
  // it (covers manual phone-in orders that completed instantly).
  const orders = await prisma.order.findMany({
    where: {
      status: statusFilter,
      OR: [
        { completedAt: { gte: from, lte: to } },
        { deliveredAt: { gte: from, lte: to } },
        { createdAt: { gte: from, lte: to } },
      ],
      ...(q.merchantId ? { merchantId: q.merchantId } : {}),
      ...(q.paymentMethod ? { paymentMethod: q.paymentMethod } : {}),
    },
    include: {
      service: { select: { nameAr: true, category: true } },
      customer: { select: { name: true, phone: true } },
    },
    orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
  });

  // We need each order's merchant name + commissionPct. Pull them in one
  // query to avoid N+1.
  const merchantIds = Array.from(
    new Set(orders.map((o) => o.merchantId).filter((id): id is string => !!id)),
  );
  const merchants = merchantIds.length
    ? await prisma.merchantProfile.findMany({
        where: { id: { in: merchantIds } },
        select: { id: true, storeNameAr: true, commissionPct: true },
      })
    : [];
  const merchantById = new Map(merchants.map((m) => [m.id, m]));

  const rows: ReportRow[] = orders.map((o) => {
    const merchant = o.merchantId ? merchantById.get(o.merchantId) : undefined;
    // Same fallback the orders list uses: prefer finalPrice (admin-confirmed
    // total) but accept quotedPrice when finalPrice was never written. A
    // surprising number of legacy completed orders never had finalPrice set
    // even though they had a quoted total — without this fallback every one
    // shows as 0 in the report.
    const finalPrice = Number(o.finalPrice ?? o.quotedPrice ?? 0);
    const recordedSubtotal = o.merchantSubtotal != null ? Number(o.merchantSubtotal) : null;
    const recordedDelivery = o.deliveryFee != null ? Number(o.deliveryFee) : null;
    const recordedCommission = o.platformCommission != null ? Number(o.platformCommission) : null;
    const discountAmount = Number(o.discountAmount ?? 0);
    const walletUsed = Number(o.walletUsed ?? 0);

    // Resolution rules (much simpler than before — no chained estimation):
    //
    //   deliveryFee:      recorded if set, else 0 (legacy orders never
    //                     captured it — pretending it was something positive
    //                     was inflating the row totals).
    //   merchantSubtotal: recorded if set, else finalPrice minus deliveryFee
    //                     (so the two numbers add back to the price the
    //                     customer actually paid).
    //   commission %:     query override > merchant override > 15% default.
    //   platformCommission: recorded if set, else computed from %.
    //                     Forced to 0 when `includeCommission=false`.
    //
    // `estimated` flips true when ANY of (subtotal, delivery, commission)
    // wasn't recorded — that way the accountant sees which rows are
    // derived numbers vs. authoritative.
    const pct =
      q.commissionPctOverride != null
        ? q.commissionPctOverride
        : merchant?.commissionPct != null
          ? Number(merchant.commissionPct)
          : DEFAULT_COMMISSION_PCT;

    const deliveryFee = recordedDelivery ?? 0;
    const merchantSubtotal = recordedSubtotal ?? Math.max(0, finalPrice - deliveryFee);

    let platformCommission: number;
    if (!q.includeCommission) {
      platformCommission = 0;
    } else if (recordedCommission != null) {
      platformCommission = recordedCommission;
    } else {
      platformCommission = Number(((merchantSubtotal * pct) / 100).toFixed(2));
    }

    const estimated =
      recordedSubtotal == null || recordedDelivery == null || recordedCommission == null;

    const merchantPayout = Number((merchantSubtotal - platformCommission).toFixed(2));
    const tamemNet = Number((platformCommission + deliveryFee).toFixed(2));
    const netRevenue = Number((finalPrice - discountAmount - walletUsed).toFixed(2));

    return {
      orderId: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customer?.name ?? '—',
      customerPhone: o.customer?.phone ?? '',
      merchantId: o.merchantId,
      merchantName: merchant?.storeNameAr ?? null,
      category: o.category,
      serviceNameAr: o.service?.nameAr ?? '',
      completedAt: (o.completedAt ?? o.deliveredAt ?? o.createdAt).toISOString(),
      status: o.status,
      paymentMethod: o.paymentMethod ?? 'CASH',
      merchantSubtotal,
      deliveryFee,
      platformCommission,
      discountAmount,
      walletUsed,
      finalPrice,
      merchantPayout,
      tamemNet,
      netRevenue,
      estimated,
    };
  });

  // ── Aggregates ─────────────────────────────────────────────────────────
  const summary: ReportSummary = {
    ordersCount: rows.length,
    totalSales: round2(rows.reduce((s, r) => s + r.finalPrice, 0)),
    totalDeliveryFees: round2(rows.reduce((s, r) => s + r.deliveryFee, 0)),
    totalCommission: round2(rows.reduce((s, r) => s + r.platformCommission, 0)),
    totalDiscounts: round2(rows.reduce((s, r) => s + r.discountAmount, 0)),
    totalWalletUsed: round2(rows.reduce((s, r) => s + r.walletUsed, 0)),
    totalMerchantPayouts: round2(rows.reduce((s, r) => s + r.merchantPayout, 0)),
    totalTamemNet: round2(rows.reduce((s, r) => s + r.tamemNet, 0)),
    totalNetRevenue: round2(rows.reduce((s, r) => s + r.netRevenue, 0)),
  };

  const byMerchantMap = new Map<
    string,
    {
      merchantId: string | null;
      merchantName: string;
      ordersCount: number;
      sales: number;
      commission: number;
      payout: number;
    }
  >();
  for (const r of rows) {
    const key = r.merchantId ?? '__none__';
    const cur = byMerchantMap.get(key) ?? {
      merchantId: r.merchantId,
      merchantName: r.merchantName ?? 'بدون تاجر',
      ordersCount: 0,
      sales: 0,
      commission: 0,
      payout: 0,
    };
    cur.ordersCount++;
    cur.sales = round2(cur.sales + r.merchantSubtotal);
    cur.commission = round2(cur.commission + r.platformCommission);
    cur.payout = round2(cur.payout + r.merchantPayout);
    byMerchantMap.set(key, cur);
  }
  const byMerchant = Array.from(byMerchantMap.values()).sort((a, b) => b.sales - a.sales);

  const byPaymentMap = new Map<
    string,
    { paymentMethod: string; ordersCount: number; sales: number }
  >();
  for (const r of rows) {
    const cur = byPaymentMap.get(r.paymentMethod) ?? {
      paymentMethod: r.paymentMethod,
      ordersCount: 0,
      sales: 0,
    };
    cur.ordersCount++;
    cur.sales = round2(cur.sales + r.finalPrice);
    byPaymentMap.set(r.paymentMethod, cur);
  }
  const byPaymentMethod = Array.from(byPaymentMap.values()).sort((a, b) => b.sales - a.sales);

  return {
    summary,
    byMerchant,
    byPaymentMethod,
    rows,
    range: { from: from.toISOString(), to: to.toISOString() },
    generatedAt: new Date().toISOString(),
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** GET /admin/reports/revenue/detailed — JSON */
export const detailedRevenue: RequestHandler = async (req, res, next) => {
  try {
    const q = querySchema.parse(req.query);
    const payload = await loadReport(q);
    ok(res, payload);
  } catch (err) {
    next(err);
  }
};
