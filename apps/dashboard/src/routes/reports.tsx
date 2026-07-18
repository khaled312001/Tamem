import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet, HandCoins, Printer } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Dialog } from '../components/ui/Dialog.js';
import { Field, Input } from '../components/ui/Input.js';
import { printReport } from '../lib/printReport.js';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button } from '../components/ui/Button.js';
import { CardSkeleton, EmptyState } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const TABS = [
  { value: 'revenue', label: 'الإيرادات' },
  { value: 'services', label: 'الخدمات' },
  { value: 'drivers', label: 'السائقون' },
  { value: 'customers', label: 'العملاء' },
] as const;

const PIE_COLORS = ['#E0301E', '#EC7A2C', '#F2A93B', '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B'];

export function ReportsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['value']>('revenue');

  const tabLabel = TABS.find((t) => t.value === tab)?.label ?? '';
  return (
    <div className="space-y-4" id="report-printable">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-brand-dark">تقرير {tabLabel}</h1>
          <p className="text-xs text-muted-foreground mt-1">
            تميم للتوصيل ·{' '}
            {new Date().toLocaleDateString('ar-EG', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
        <div data-print="hide">
          <Button onClick={() => printReport('report-printable', `تقرير ${tabLabel} - تميم`)}>
            <Printer className="w-4 h-4" /> طباعة / PDF
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-border p-3 flex gap-1" data-print="hide">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm transition ${tab === t.value ? 'bg-brand-red text-white font-bold' : 'hover:bg-muted'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'revenue' && <RevenueTab />}
      {tab === 'services' && <ServicesTab />}
      {tab === 'drivers' && <DriversTab />}
      {tab === 'customers' && <CustomersTab />}
    </div>
  );
}

function RevenueTab() {
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'reports', 'revenue', groupBy],
    queryFn: () => api.adminReportRevenue({ groupBy }) as Promise<Row>,
  });

  // Defensive: the shim/back-end shape can drift, so never assume `series`
  // exists. Fall back to `trend` (day/revenue) or an empty array.
  const series: Row[] = Array.isArray(data?.series)
    ? data.series
    : Array.isArray(data?.trend)
      ? data.trend.map((t: Row) => ({
          bucket: t.day ?? t.bucket,
          orders: t.orders ?? 0,
          revenue: t.revenue ?? 0,
        }))
      : [];
  const total = Number(data?.total ?? data?.totalRevenue ?? 0);
  const ordersCount = Number(data?.ordersCount ?? data?.orderCount ?? 0);

  const exportCsv = () => {
    if (!series.length) return;
    const rows = [
      'bucket,orders,revenue',
      ...series.map((s: Row) => `${s.bucket},${s.orders},${s.revenue}`),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `revenue-${groupBy}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <CardSkeleton />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm text-muted-foreground">إجمالي الإيرادات</div>
            <div className="text-3xl font-black mt-1">{total.toLocaleString('ar-EG')} ج.م</div>
            <div className="text-xs text-muted-foreground mt-1">{ordersCount} طلب مكتمل</div>
          </div>
          <div className="flex gap-2">
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as 'day' | 'week' | 'month')}
              className="px-3 py-2 rounded-lg border border-input bg-white text-sm"
            >
              <option value="day">يومي</option>
              <option value="week">أسبوعي</option>
              <option value="month">شهري</option>
            </select>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="w-4 h-4" />
              CSV
            </Button>
          </div>
        </div>
        <div className="h-64">
          {series.length === 0 ? (
            <EmptyState title="لا توجد بيانات في هذه الفترة" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="bucket" />
                <YAxis />
                <Tooltip formatter={(v: number) => `${v.toLocaleString('ar-EG')} ج.م`} />
                <Line dataKey="revenue" stroke="#E0301E" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

function ServicesTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'reports', 'services'],
    queryFn: () => api.adminReportServices() as Promise<Row[]>,
  });
  if (isLoading) return <CardSkeleton />;
  if (!data?.length) return <EmptyState title="لا توجد بيانات" />;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white rounded-xl border border-border p-5">
        <h3 className="font-bold mb-3">الخدمات بالعدد</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="nameAr" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="orders" fill="#E0301E" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-border p-5">
        <h3 className="font-bold mb-3">الإيرادات حسب الخدمة</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="revenue" nameKey="nameAr" outerRadius={80}>
                {data.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => `${v.toLocaleString('ar-EG')} ج.م`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-border p-5 lg:col-span-2">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr className="text-right">
              <th className="py-2 font-bold">الخدمة</th>
              <th className="py-2 font-bold">الفئة</th>
              <th className="py-2 font-bold">الطلبات</th>
              <th className="py-2 font-bold">الإيرادات</th>
            </tr>
          </thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.serviceId} className="border-b border-border/30">
                <td className="py-2">{s.nameAr}</td>
                <td className="py-2 text-xs">{s.category}</td>
                <td className="py-2 font-bold">{s.orders}</td>
                <td className="py-2 font-bold">{Number(s.revenue).toLocaleString('ar-EG')} ج.م</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const money = (v: unknown) =>
  `${Number(v ?? 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;

type DriverFilters = {
  driverId: string;
  from: string;
  to: string;
  status: string;
  settlement: string;
  governorate: string;
};

function DriversTab() {
  const qc = useQueryClient();
  const [f, setF] = useState<DriverFilters>({
    driverId: '',
    from: '',
    to: '',
    status: '',
    settlement: '',
    governorate: '',
  });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [settleFor, setSettleFor] = useState<Row | null>(null);

  const params: Record<string, unknown> = {};
  if (f.driverId) params.driverId = f.driverId;
  if (f.from) params.from = f.from;
  if (f.to) params.to = f.to;
  if (f.status) params.status = f.status;
  if (f.settlement) params.settlement = f.settlement;
  if (f.governorate) params.governorate = f.governorate;

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'reports', 'drivers', params],
    queryFn: () => api.adminReportDrivers(params) as Promise<Row>,
  });

  const drivers: Row[] = Array.isArray(data?.drivers) ? data.drivers : [];
  const totals: Row = data?.totals ?? {};
  const governorates: string[] = Array.isArray(data?.governorates) ? data.governorates : [];

  const exportExcel = async () => {
    if (!drivers.length) return;
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('السائقون');
    ws.views = [{ rightToLeft: true, state: 'frozen', ySplit: 1 }];
    ws.columns = [
      { header: 'اسم السائق', key: 'name', width: 22 },
      { header: 'الهاتف', key: 'phone', width: 16 },
      { header: 'عدد التوصيلات', key: 'deliveries', width: 12 },
      { header: 'إجمالي المحصّل', key: 'totalCollected', width: 16 },
      { header: 'قيمة منتجات التجار', key: 'merchantGoods', width: 16 },
      { header: 'إجمالي رسوم التوصيل', key: 'totalDeliveryFees', width: 16 },
      { header: 'نسبة السائق %', key: 'deliverySharePct', width: 12 },
      { header: 'مستحق السائق', key: 'driverDue', width: 14 },
      { header: 'إيراد تميم', key: 'tamemRevenue', width: 14 },
      { header: 'المسدد للسائق', key: 'paid', width: 14 },
      { header: 'المتبقي المستحق', key: 'remaining', width: 14 },
      { header: 'التقييم', key: 'rating', width: 10 },
    ];
    ws.getRow(1).font = { bold: true };
    drivers.forEach((d) => ws.addRow(d));
    const t = ws.addRow({
      name: 'الإجمالي',
      deliveries: totals.deliveries ?? 0,
      totalCollected: totals.totalCollected ?? 0,
      merchantGoods: totals.merchantGoods ?? 0,
      totalDeliveryFees: totals.totalDeliveryFees ?? 0,
      driverDue: totals.driverDue ?? 0,
      tamemRevenue: totals.tamemRevenue ?? 0,
      paid: totals.paid ?? 0,
      remaining: totals.remaining ?? 0,
    });
    t.font = { bold: true };
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(
      new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `drivers-report-${Date.now()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () =>
    setF({ driverId: '', from: '', to: '', status: '', settlement: '', governorate: '' });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div
        className="bg-white rounded-xl border border-border p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"
        data-print="hide"
      >
        <label className="text-xs">
          <span className="font-bold text-muted-foreground">السائق</span>
          <select
            value={f.driverId}
            onChange={(e) => setF({ ...f, driverId: e.target.value })}
            className="mt-1 w-full px-2 py-1.5 rounded-lg border border-input bg-white text-sm"
          >
            <option value="">الكل</option>
            {drivers.map((d) => (
              <option key={d.driverId} value={d.driverId}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="font-bold text-muted-foreground">من تاريخ</span>
          <input
            type="date"
            value={f.from}
            onChange={(e) => setF({ ...f, from: e.target.value })}
            className="mt-1 w-full px-2 py-1.5 rounded-lg border border-input bg-white text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="font-bold text-muted-foreground">إلى تاريخ</span>
          <input
            type="date"
            value={f.to}
            onChange={(e) => setF({ ...f, to: e.target.value })}
            className="mt-1 w-full px-2 py-1.5 rounded-lg border border-input bg-white text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="font-bold text-muted-foreground">حالة الطلب</span>
          <select
            value={f.status}
            onChange={(e) => setF({ ...f, status: e.target.value })}
            className="mt-1 w-full px-2 py-1.5 rounded-lg border border-input bg-white text-sm"
          >
            <option value="">مكتمل + مُسلَّم</option>
            <option value="DELIVERED">مُسلَّم</option>
            <option value="COMPLETED">مكتمل</option>
          </select>
        </label>
        <label className="text-xs">
          <span className="font-bold text-muted-foreground">حالة التسوية</span>
          <select
            value={f.settlement}
            onChange={(e) => setF({ ...f, settlement: e.target.value })}
            className="mt-1 w-full px-2 py-1.5 rounded-lg border border-input bg-white text-sm"
          >
            <option value="">الكل</option>
            <option value="PENDING">مستحق</option>
            <option value="SETTLED">مسوّى</option>
          </select>
        </label>
        <label className="text-xs">
          <span className="font-bold text-muted-foreground">المحافظة</span>
          <select
            value={f.governorate}
            onChange={(e) => setF({ ...f, governorate: e.target.value })}
            className="mt-1 w-full px-2 py-1.5 rounded-lg border border-input bg-white text-sm"
          >
            <option value="">الكل</option>
            {governorates.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <div className="col-span-2 md:col-span-3 lg:col-span-6 flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={resetFilters}>
            مسح الفلاتر
          </Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={exportExcel}>
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </Button>
        </div>
      </div>

      {isLoading ? (
        <CardSkeleton />
      ) : !drivers.length ? (
        <EmptyState title="لا توجد بيانات في هذه الفترة" />
      ) : (
        <div className="bg-white rounded-xl border border-border p-5 overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead className="border-b border-border">
              <tr className="text-right whitespace-nowrap">
                <th className="py-2 px-2 font-bold">السائق</th>
                <th className="py-2 px-2 font-bold">الهاتف</th>
                <th className="py-2 px-2 font-bold">التوصيلات</th>
                <th className="py-2 px-2 font-bold">إجمالي المحصّل</th>
                <th className="py-2 px-2 font-bold">منتجات التجار</th>
                <th className="py-2 px-2 font-bold">رسوم التوصيل</th>
                <th className="py-2 px-2 font-bold">نسبة السائق</th>
                <th className="py-2 px-2 font-bold">مستحق السائق</th>
                <th className="py-2 px-2 font-bold">إيراد تميم</th>
                <th className="py-2 px-2 font-bold">المسدد</th>
                <th className="py-2 px-2 font-bold">المتبقي</th>
                <th className="py-2 px-2 font-bold">التقييم</th>
                <th className="py-2 px-2 font-bold" data-print="hide"></th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr
                  key={d.driverId}
                  className="border-b border-border/30 whitespace-nowrap hover:bg-muted/40"
                >
                  <td className="py-2 px-2">
                    <button
                      onClick={() => setDetailId(d.driverId)}
                      className="font-bold text-brand-red hover:underline"
                    >
                      {d.name}
                    </button>
                  </td>
                  <td className="py-2 px-2 text-xs" dir="ltr">
                    {d.phone}
                  </td>
                  <td className="py-2 px-2 font-bold">{d.deliveries}</td>
                  <td className="py-2 px-2">{money(d.totalCollected)}</td>
                  <td className="py-2 px-2 text-muted-foreground">{money(d.merchantGoods)}</td>
                  <td className="py-2 px-2">{money(d.totalDeliveryFees)}</td>
                  <td className="py-2 px-2">{Number(d.deliverySharePct ?? 0)}%</td>
                  <td className="py-2 px-2 font-bold text-emerald-700">{money(d.driverDue)}</td>
                  <td className="py-2 px-2 font-bold text-brand-red">{money(d.tamemRevenue)}</td>
                  <td className="py-2 px-2 text-muted-foreground">{money(d.paid)}</td>
                  <td className="py-2 px-2 font-bold">{money(d.remaining)}</td>
                  <td className="py-2 px-2">
                    {d.rating ? `⭐ ${Number(d.rating).toFixed(1)}` : '—'}
                  </td>
                  <td className="py-2 px-2" data-print="hide">
                    {Number(d.remaining) > 0 && (
                      <button
                        onClick={() => setSettleFor(d)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold"
                      >
                        <HandCoins className="w-3.5 h-3.5" /> تسوية
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-black whitespace-nowrap bg-muted/30">
                <td className="py-2 px-2">الإجمالي</td>
                <td className="py-2 px-2" />
                <td className="py-2 px-2">{totals.deliveries ?? 0}</td>
                <td className="py-2 px-2">{money(totals.totalCollected)}</td>
                <td className="py-2 px-2">{money(totals.merchantGoods)}</td>
                <td className="py-2 px-2">{money(totals.totalDeliveryFees)}</td>
                <td className="py-2 px-2" />
                <td className="py-2 px-2 text-emerald-700">{money(totals.driverDue)}</td>
                <td className="py-2 px-2 text-brand-red">{money(totals.tamemRevenue)}</td>
                <td className="py-2 px-2">{money(totals.paid)}</td>
                <td className="py-2 px-2">{money(totals.remaining)}</td>
                <td className="py-2 px-2" colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {detailId && (
        <DriverDetailModal driverId={detailId} filters={f} onClose={() => setDetailId(null)} />
      )}
      {settleFor && (
        <SettleDialog
          driver={settleFor}
          filters={f}
          onClose={() => setSettleFor(null)}
          onDone={() => {
            setSettleFor(null);
            qc.invalidateQueries({ queryKey: ['admin', 'reports', 'drivers'] });
          }}
        />
      )}
    </div>
  );
}

function SettleDialog({
  driver,
  filters,
  onClose,
  onDone,
}: {
  driver: Row;
  filters: DriverFilters;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState('');
  const mut = useMutation({
    mutationFn: () =>
      api.adminSettleDriver(driver.driverId, {
        from: filters.from || undefined,
        to: filters.to || undefined,
        note: note.trim() || undefined,
      }),
    onSuccess: (r: Row) => {
      toast.success(`تمت تسوية ${r?.orderCount ?? ''} طلب بمبلغ ${money(r?.amount)}`);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`تسوية مستحقات: ${driver.name}`}
      size="sm"
    >
      <div className="space-y-3">
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm">
          <div className="flex justify-between">
            <span>المتبقي المستحق</span>
            <span className="font-black text-emerald-700">{money(driver.remaining)}</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>طلبات غير مسوّاة</span>
            <span>{driver.pendingCount ?? 0}</span>
          </div>
          {(filters.from || filters.to) && (
            <p className="text-[11px] text-muted-foreground mt-2">
              ستُسوّى الطلبات ضمن الفترة المحددة في الفلاتر فقط.
            </p>
          )}
        </div>
        <Field label="ملاحظة (اختياري)">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="مثال: تم الدفع نقداً"
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" size="md" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            <HandCoins className="w-4 h-4" />
            {mut.isPending ? 'جارٍ التسوية…' : 'تأكيد التسوية'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function DriverDetailModal({
  driverId,
  filters,
  onClose,
}: {
  driverId: string;
  filters: DriverFilters;
  onClose: () => void;
}) {
  const params: Record<string, unknown> = {};
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.status) params.status = filters.status;
  if (filters.settlement) params.settlement = filters.settlement;
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'reports', 'driver-detail', driverId, params],
    queryFn: () => api.adminReportDriverDetail(driverId, params) as Promise<Row>,
  });
  const orders: Row[] = Array.isArray(data?.orders) ? data.orders : [];
  const totals: Row = data?.totals ?? {};
  const d: Row = data?.driver ?? {};
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`تفاصيل السائق: ${d.name ?? ''}`}
      size="xl"
    >
      {isLoading ? (
        <CardSkeleton />
      ) : !orders.length ? (
        <EmptyState title="لا توجد طلبات في هذه الفترة" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="border-b border-border">
              <tr className="text-right whitespace-nowrap">
                <th className="py-2 px-2 font-bold">رقم الطلب</th>
                <th className="py-2 px-2 font-bold">تاريخ التسليم</th>
                <th className="py-2 px-2 font-bold">قيمة المنتجات</th>
                <th className="py-2 px-2 font-bold">رسوم التوصيل</th>
                <th className="py-2 px-2 font-bold">نسبة السائق</th>
                <th className="py-2 px-2 font-bold">مستحق السائق</th>
                <th className="py-2 px-2 font-bold">إيراد تميم</th>
                <th className="py-2 px-2 font-bold">إجمالي المحصّل</th>
                <th className="py-2 px-2 font-bold">التسوية</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.orderId} className="border-b border-border/30 whitespace-nowrap">
                  <td className="py-2 px-2 font-bold" dir="ltr">
                    #{o.orderNumber}
                  </td>
                  <td className="py-2 px-2 text-xs">
                    {o.deliveredAt
                      ? new Date(o.deliveredAt).toLocaleDateString('ar-EG', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : '—'}
                  </td>
                  <td className="py-2 px-2 text-muted-foreground">{money(o.merchantGoods)}</td>
                  <td className="py-2 px-2">{money(o.deliveryFee)}</td>
                  <td className="py-2 px-2">{Number(o.sharePct ?? 0)}%</td>
                  <td className="py-2 px-2 font-bold text-emerald-700">{money(o.driverDue)}</td>
                  <td className="py-2 px-2 font-bold text-brand-red">{money(o.tamemRevenue)}</td>
                  <td className="py-2 px-2">{money(o.totalCollected)}</td>
                  <td className="py-2 px-2">
                    {o.settlementStatus === 'SETTLED' ? (
                      <span className="text-emerald-700 text-xs font-bold">مسوّى</span>
                    ) : (
                      <span className="text-amber-600 text-xs font-bold">مستحق</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-black whitespace-nowrap bg-muted/30">
                <td className="py-2 px-2" colSpan={2}>
                  الإجمالي ({totals.deliveries ?? 0})
                </td>
                <td className="py-2 px-2">{money(totals.merchantGoods)}</td>
                <td className="py-2 px-2">{money(totals.deliveryFees)}</td>
                <td className="py-2 px-2" />
                <td className="py-2 px-2 text-emerald-700">{money(totals.driverDue)}</td>
                <td className="py-2 px-2 text-brand-red">{money(totals.tamemRevenue)}</td>
                <td className="py-2 px-2">{money(totals.totalCollected)}</td>
                <td className="py-2 px-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Dialog>
  );
}

function CustomersTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'reports', 'customers'],
    queryFn: () => api.adminReportCustomers() as Promise<Row[]>,
  });
  if (isLoading) return <CardSkeleton />;
  if (!data?.length) return <EmptyState title="لا توجد بيانات" />;
  return (
    <div className="bg-white rounded-xl border border-border p-5">
      <h3 className="font-bold mb-3">العملاء الأكثر نشاطاً</h3>
      <table className="w-full text-sm">
        <thead className="border-b border-border">
          <tr className="text-right">
            <th className="py-2 font-bold">#</th>
            <th className="py-2 font-bold">الاسم</th>
            <th className="py-2 font-bold">المدينة</th>
            <th className="py-2 font-bold">الطلبات</th>
            <th className="py-2 font-bold">إجمالي الإنفاق</th>
          </tr>
        </thead>
        <tbody>
          {data.map((c, i) => (
            <tr key={c.customerId} className="border-b border-border/30">
              <td className="py-2 font-bold">{i + 1}</td>
              <td className="py-2">{c.name}</td>
              <td className="py-2 text-xs">{c.city}</td>
              <td className="py-2 font-bold">{c.orders}</td>
              <td className="py-2">{Number(c.totalSpend).toLocaleString('ar-EG')} ج.م</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
