/**
 * Revenue report — accountant-facing detailed report with printable layout.
 *
 * Layout:
 *   - Header (period selector + filters + Print / CSV buttons) → hidden on print
 *   - Summary cards (totals at the top)
 *   - Breakdown tables (by merchant + by payment method)
 *   - Full line-item table (every order with money columns)
 *
 * Print: Tailwind `print:` utilities strip the dashboard chrome and give a
 * clean A4-friendly page. The "تحميل CSV" button hits the backend CSV
 * endpoint directly so Excel can open it.
 */
import { useQuery } from '@tanstack/react-query';
import { Calendar, FileSpreadsheet, Loader2, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '../lib/auth.js';
import { api } from '../lib/api.js';

type Preset = 'today' | 'week' | 'month' | 'custom';

interface ReportRow {
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
  /** null = the order never recorded this figure. Distinct from 0, which is a
   *  real measured zero — see `estimated` / the "غير مفصّلة" summary card. */
  merchantSubtotal: number | null;
  deliveryFee: number | null;
  platformCommission: number | null;
  discountAmount: number;
  walletUsed: number;
  finalPrice: number;
  merchantPayout: number | null;
  tamemNet: number | null;
  netRevenue: number | null;
  /** true when the goods/delivery split is missing, so this row's money can't
   *  be attributed to a merchant or to Tamem. */
  estimated: boolean;
}

interface ReportSummary {
  ordersCount: number;
  totalSales: number;
  totalDeliveryFees: number;
  totalCommission: number;
  totalDiscounts: number;
  totalWalletUsed: number;
  totalMerchantPayouts: number;
  totalTamemNet: number;
  totalNetRevenue: number;
  /** Goods value across the period — sums only the rows that recorded one. */
  totalOrderValue?: number;
  /** Orders whose goods/delivery split was never recorded. The totals above
   *  exclude their money entirely, so this is what the report can't account
   *  for — shown rather than absorbed silently into a bucket. */
  unattributedOrders?: number;
  unattributedAmount?: number;
}

interface ReportPayload {
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

const PRESET_LABELS: Record<Preset, string> = {
  today: 'اليوم',
  week: 'آخر 7 أيام',
  month: 'الشهر',
  custom: 'فترة مخصصة',
};

const PAYMENT_AR: Record<string, string> = {
  CASH: 'كاش',
  VODAFONE_CASH: 'فودافون كاش',
  INSTAPAY: 'إنستاباي',
};

const STATUS_AR: Record<string, string> = {
  COMPLETED: 'مكتمل',
  DELIVERED: 'تم التوصيل',
};

/** null/undefined renders as "—": the figure was never recorded, which is not
 *  the same claim as 0.00. */
function fmtMoney(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ar-EG', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function RevenueReportPage() {
  const tokens = useAuth((s) => s.tokens);
  const [preset, setPreset] = useState<Preset>('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('');
  const [merchantId, setMerchantId] = useState<string>('');
  // Commission controls — admin can flip Tamem's cut off entirely (e.g.
  // for free-period merchants) or set a flat override % across all rows.
  // Off by default: Tamem isn't charging a commission today, so defaulting it
  // on made every report show money the platform never took and understate
  // what each merchant is actually owed. The admin turns it on deliberately.
  const [includeCommission, setIncludeCommission] = useState(false);
  const [commissionPct, setCommissionPct] = useState<string>(''); // empty = use per-merchant

  const params = useMemo(() => {
    const p: Record<string, string> = { preset };
    if (preset === 'custom') {
      if (from) p.from = from;
      if (to) p.to = to;
    }
    if (paymentMethod) p.paymentMethod = paymentMethod;
    if (merchantId) p.merchantId = merchantId;
    p.includeCommission = includeCommission ? 'true' : 'false';
    if (includeCommission && commissionPct && !isNaN(Number(commissionPct))) {
      p.commissionPctOverride = commissionPct;
    }
    return p;
  }, [preset, from, to, paymentMethod, merchantId, includeCommission, commissionPct]);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'revenue-report', params],
    queryFn: () => api.adminRevenueReport(params) as Promise<ReportPayload>,
  });

  const { data: merchantsPage } = useQuery({
    queryKey: ['admin', 'merchants', 'for-report'],
    queryFn: () =>
      api.adminListMerchants({ pageSize: 200 }) as Promise<{
        items: Array<{ id: string; storeNameAr: string }>;
      }>,
  });

  const [downloading, setDownloading] = useState(false);

  // Use fetch+blob (instead of window.open) so the access token can travel
  // in the Authorization header — the CSV endpoint refuses anonymous calls.
  const downloadCsv = async () => {
    if (!tokens?.accessToken) return;
    setDownloading(true);
    try {
      const baseUrl = (import.meta.env.VITE_API_URL as string) || 'http://localhost:4000';
      const search = new URLSearchParams(params);
      const res = await fetch(`${baseUrl}/api/v1/admin/reports/revenue.csv?${search.toString()}`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      if (!res.ok) throw new Error('فشل تحميل التقرير');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tamem-revenue-${(params.from ?? '').slice(0, 10) || params.preset}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header — hidden on print */}
      <div className="print:hidden space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black text-brand-dark">تقرير الإيرادات</h1>
            <p className="text-sm text-muted-foreground mt-1">
              تقرير محاسبي مفصّل بالطلبات والعمولات والمستحقات
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted text-sm font-bold hover:bg-muted/80 disabled:opacity-50"
            >
              {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : '↻'}
              تحديث
            </button>
            <button
              onClick={downloadCsv}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-bold hover:bg-green-700 disabled:opacity-60"
            >
              {downloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
              تحميل Excel
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-red text-white text-sm font-bold hover:bg-brand-red/90"
            >
              <Printer className="w-4 h-4" />
              طباعة / PDF
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-muted-foreground inline-flex items-center gap-1.5">
              <Calendar className="w-4 h-4" /> الفترة:
            </span>
            {(['today', 'week', 'month', 'custom'] as Preset[]).map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition ${
                  preset === p ? 'bg-brand-red text-white' : 'bg-muted hover:bg-muted/80'
                }`}
              >
                {PRESET_LABELS[p]}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-sm font-bold text-muted-foreground">من:</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="px-3 py-1.5 border border-input rounded-lg text-sm"
              />
              <label className="text-sm font-bold text-muted-foreground">إلى:</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="px-3 py-1.5 border border-input rounded-lg text-sm"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-muted-foreground block mb-1">
                طريقة الدفع
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-1.5 border border-input rounded-lg text-sm bg-white"
              >
                <option value="">الكل</option>
                <option value="CASH">كاش</option>
                <option value="VODAFONE_CASH">فودافون كاش</option>
                <option value="INSTAPAY">إنستاباي</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-muted-foreground block mb-1">
                التاجر / المطعم
              </label>
              <select
                value={merchantId}
                onChange={(e) => setMerchantId(e.target.value)}
                className="w-full px-3 py-1.5 border border-input rounded-lg text-sm bg-white"
              >
                <option value="">كل التجار ({merchantsPage?.items.length ?? 0})</option>
                {(merchantsPage?.items ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.storeNameAr}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-muted-foreground block mb-1">
                {merchantId ? 'إلغاء فلتر التاجر' : ' '}
              </label>
              {merchantId ? (
                <button
                  onClick={() => setMerchantId('')}
                  className="w-full px-3 py-1.5 border border-input rounded-lg text-sm bg-muted hover:bg-muted/80"
                >
                  عرض كل التجار
                </button>
              ) : (
                <div className="px-3 py-1.5 text-sm text-muted-foreground">—</div>
              )}
            </div>
          </div>

          {/* Commission controls */}
          <div className="border-t border-border pt-3 mt-3">
            <div className="flex items-start gap-3 flex-wrap">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeCommission}
                  onChange={(e) => setIncludeCommission(e.target.checked)}
                  className="w-4 h-4 accent-brand-red"
                />
                <span className="text-sm font-bold">احتساب عمولة التطبيق</span>
              </label>
              {includeCommission && (
                <div className="inline-flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">نسبة موحّدة:</label>
                  <input
                    type="number"
                    placeholder="15"
                    min={0}
                    max={100}
                    value={commissionPct}
                    onChange={(e) => setCommissionPct(e.target.value)}
                    className="w-20 px-2 py-1 border border-input rounded text-sm"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                  <span className="text-xs text-muted-foreground">
                    (اتركها فاضية لاستخدام نسبة كل تاجر)
                  </span>
                </div>
              )}
            </div>
            {!includeCommission && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded p-2 mt-2">
                ⚠ عمولة التطبيق معطّلة — كل المبيعات هتظهر كمستحقات كاملة للتاجر
              </p>
            )}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          جاري تحميل التقرير...
        </div>
      ) : isError || !data ? (
        <div className="bg-white rounded-xl border border-destructive/30 p-6 text-center">
          تعذّر تحميل التقرير
        </div>
      ) : (
        <PrintableReport data={data} showCommission={includeCommission} />
      )}
    </div>
  );
}

function PrintableReport({
  data,
  showCommission,
}: {
  data: ReportPayload;
  showCommission: boolean;
}) {
  return (
    <div className="space-y-4 print:space-y-3">
      {/* Print-only header */}
      <div className="hidden print:block text-center border-b-2 border-brand-red pb-3">
        <h1 className="text-3xl font-black text-brand-dark">تقرير إيرادات تَميم</h1>
        <p className="text-sm mt-1">
          الفترة: {fmtDate(data.range.from)} ← {fmtDate(data.range.to)}
        </p>
        <p className="text-xs text-muted-foreground">تم الإنشاء: {fmtDate(data.generatedAt)}</p>
      </div>

      {/* Money the report cannot attribute — stated up front, because every
          figure below silently excludes it and a reader would otherwise take
          the totals as covering the whole period. */}
      {(data.summary.unattributedOrders ?? 0) > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800/60 dark:bg-amber-950/30">
          <p className="font-bold text-amber-900 dark:text-amber-300">
            {data.summary.unattributedOrders} طلب بمبلغ {fmtMoney(data.summary.unattributedAmount)}{' '}
            ج.م غير مفصّلة
          </p>
          <p className="mt-1 text-amber-800 dark:text-amber-400/90">
            دي طلبات اتسعّرت بمبلغ إجمالي واحد من غير ما يتسجّل قيمة البضاعة ورسوم التوصيل كل واحدة
            لوحدها، فمش محسوبة في العمولة ولا في مستحقات التجار ولا في صافي أرباح تميم تحت.
            لتصحيحها: افتح الطلب واضغط «تسعير» وأدخل القيمتين.
          </p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:grid-cols-4">
        <SummaryCard label="عدد الطلبات" value={data.summary.ordersCount.toString()} />
        <SummaryCard
          label="إجمالي المبيعات"
          value={fmtMoney(data.summary.totalSales)}
          unit="ج.م"
          highlight
        />
        {showCommission && (
          <SummaryCard
            label="عمولة التطبيق"
            value={fmtMoney(data.summary.totalCommission)}
            unit="ج.م"
          />
        )}
        <SummaryCard
          label="رسوم التوصيل"
          value={fmtMoney(data.summary.totalDeliveryFees)}
          unit="ج.م"
        />
        <SummaryCard label="الخصومات" value={fmtMoney(data.summary.totalDiscounts)} unit="ج.م" />
        <SummaryCard
          label="استخدام المحفظة"
          value={fmtMoney(data.summary.totalWalletUsed)}
          unit="ج.م"
        />
        <SummaryCard
          label="مستحقات التجار"
          value={fmtMoney(data.summary.totalMerchantPayouts)}
          unit="ج.م"
          highlight={!showCommission}
        />
        {showCommission && (
          <SummaryCard
            label="صافي إيرادات تَميم"
            value={fmtMoney(data.summary.totalTamemNet)}
            unit="ج.م"
            highlight
          />
        )}
      </div>

      {/* By merchant */}
      <Section title="الإيرادات حسب التاجر">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr className="text-right">
              <th className="px-3 py-2 font-bold">التاجر</th>
              <th className="px-3 py-2 font-bold">عدد الطلبات</th>
              <th className="px-3 py-2 font-bold">المبيعات</th>
              {showCommission && <th className="px-3 py-2 font-bold">العمولة</th>}
              <th className="px-3 py-2 font-bold">المستحقات</th>
            </tr>
          </thead>
          <tbody>
            {data.byMerchant.map((m) => (
              <tr key={m.merchantId ?? '_'} className="border-b border-border/40">
                <td className="px-3 py-2">{m.merchantName}</td>
                <td className="px-3 py-2">{m.ordersCount}</td>
                <td className="px-3 py-2">{fmtMoney(m.sales)} ج.م</td>
                {showCommission && <td className="px-3 py-2">{fmtMoney(m.commission)} ج.م</td>}
                <td className="px-3 py-2 font-bold">{fmtMoney(m.payout)} ج.م</td>
              </tr>
            ))}
            {data.byMerchant.length === 0 && (
              <tr>
                <td
                  colSpan={showCommission ? 5 : 4}
                  className="px-3 py-4 text-center text-muted-foreground"
                >
                  لا توجد بيانات
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      {/* By payment method */}
      <Section title="الإيرادات حسب طريقة الدفع">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr className="text-right">
              <th className="px-3 py-2 font-bold">الطريقة</th>
              <th className="px-3 py-2 font-bold">عدد الطلبات</th>
              <th className="px-3 py-2 font-bold">المبيعات</th>
            </tr>
          </thead>
          <tbody>
            {data.byPaymentMethod.map((p) => (
              <tr key={p.paymentMethod} className="border-b border-border/40">
                <td className="px-3 py-2">{PAYMENT_AR[p.paymentMethod] ?? p.paymentMethod}</td>
                <td className="px-3 py-2">{p.ordersCount}</td>
                <td className="px-3 py-2">{fmtMoney(p.sales)} ج.م</td>
              </tr>
            ))}
            {data.byPaymentMethod.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">
                  لا توجد بيانات
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      {/* Line items */}
      <Section title={`تفاصيل الطلبات (${data.rows.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 border-b border-border">
              <tr className="text-right">
                <th className="px-2 py-2 font-bold">رقم الطلب</th>
                <th className="px-2 py-2 font-bold">التاريخ</th>
                <th className="px-2 py-2 font-bold">العميل</th>
                <th className="px-2 py-2 font-bold">التاجر</th>
                <th className="px-2 py-2 font-bold">الخدمة</th>
                <th className="px-2 py-2 font-bold">الحالة</th>
                <th className="px-2 py-2 font-bold">الدفع</th>
                <th className="px-2 py-2 font-bold">القيمة</th>
                <th className="px-2 py-2 font-bold">توصيل</th>
                {showCommission && <th className="px-2 py-2 font-bold">عمولة</th>}
                <th className="px-2 py-2 font-bold">خصم</th>
                <th className="px-2 py-2 font-bold">الإجمالي</th>
                <th className="px-2 py-2 font-bold">للتاجر</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.orderId} className="border-b border-border/40 hover:bg-muted/20">
                  <td className="px-2 py-2 font-mono">{r.orderNumber}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{fmtDate(r.completedAt)}</td>
                  <td className="px-2 py-2">
                    <div>{r.customerName}</div>
                    <div className="text-muted-foreground" dir="ltr">
                      {r.customerPhone}
                    </div>
                  </td>
                  <td className="px-2 py-2">{r.merchantName ?? '—'}</td>
                  <td className="px-2 py-2">{r.serviceNameAr}</td>
                  <td className="px-2 py-2">{STATUS_AR[r.status] ?? r.status}</td>
                  <td className="px-2 py-2">{PAYMENT_AR[r.paymentMethod] ?? r.paymentMethod}</td>
                  <td className="px-2 py-2">{fmtMoney(r.merchantSubtotal)}</td>
                  <td className="px-2 py-2">{fmtMoney(r.deliveryFee)}</td>
                  {showCommission && (
                    <td className="px-2 py-2">{fmtMoney(r.platformCommission)}</td>
                  )}
                  <td className="px-2 py-2 text-green-600">
                    {r.discountAmount > 0 ? `-${fmtMoney(r.discountAmount)}` : '—'}
                  </td>
                  <td className="px-2 py-2 font-bold">{fmtMoney(r.finalPrice)}</td>
                  <td className="px-2 py-2 font-bold text-brand-red">
                    {fmtMoney(r.merchantPayout)}
                  </td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr>
                  <td
                    colSpan={showCommission ? 13 : 12}
                    className="px-3 py-4 text-center text-muted-foreground"
                  >
                    لا توجد طلبات في هذه الفترة
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-brand-red/5 font-bold border-t-2 border-brand-red">
              <tr>
                <td colSpan={7} className="px-2 py-2 text-left">
                  الإجمالي:
                </td>
                <td className="px-2 py-2">{fmtMoney(data.summary.totalOrderValue ?? 0)}</td>
                <td className="px-2 py-2">{fmtMoney(data.summary.totalDeliveryFees)}</td>
                {showCommission && (
                  <td className="px-2 py-2">{fmtMoney(data.summary.totalCommission)}</td>
                )}
                <td className="px-2 py-2 text-green-600">
                  -{fmtMoney(data.summary.totalDiscounts)}
                </td>
                <td className="px-2 py-2 text-brand-red">{fmtMoney(data.summary.totalSales)}</td>
                <td className="px-2 py-2 text-brand-red">
                  {fmtMoney(data.summary.totalMerchantPayouts)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Section>

      {/* Print-only signature block */}
      <div className="hidden print:block mt-8 border-t pt-4 text-sm grid grid-cols-2 gap-4">
        <div>
          <p className="font-bold">اعتمد المحاسب:</p>
          <div className="mt-8 border-t border-black w-48">التوقيع</div>
        </div>
        <div className="text-left">
          <p className="font-bold">اعتمد المدير:</p>
          <div className="mt-8 border-t border-black w-48 ms-auto">التوقيع</div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value: string;
  unit?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-3 border ${
        highlight ? 'bg-brand-red text-white border-brand-red' : 'bg-white border-border'
      }`}
    >
      <div className={`text-xs ${highlight ? 'text-white/85' : 'text-muted-foreground'}`}>
        {label}
      </div>
      <div className="text-xl font-black mt-1">
        {value}
        {unit && <span className="text-xs font-normal opacity-85 mr-1">{unit}</span>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden print:border-2 print:break-inside-avoid">
      <div className="bg-muted/30 px-4 py-2 font-bold border-b border-border">{title}</div>
      <div className="p-1">{children}</div>
    </div>
  );
}
