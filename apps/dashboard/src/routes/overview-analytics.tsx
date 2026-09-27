import { useQuery } from '@tanstack/react-query';
import {
  Award,
  CalendarDays,
  Clock,
  Package,
  PieChart as PieIcon,
  Store,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { CardSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';
import { formatCount, formatMoney } from '../lib/format.js';

type Range = 'today' | 'week' | 'month';

interface Analytics {
  kpis: {
    orders: number;
    active: number;
    completed: number;
    cancelled: number;
    sales: number;
    delivery: number;
    avgOrderValue: number;
    completionRate: number;
    newCustomers: number;
  };
  bySource: { source: string; orders: number; sales: number }[];
  byWeekday: { weekday: number; orders: number; sales: number }[];
  byHour: { hour: number; orders: number }[];
  byStatus: { status: string; orders: number }[];
  topMerchants: { name: string; orders: number; sales: number }[];
  topProducts: { name: string; qty: number; sales: number }[];
}

const PALETTE = [
  '#E0301E',
  '#EC7A2C',
  '#F2A93B',
  '#3B82F6',
  '#10B981',
  '#8B5CF6',
  '#14B8A6',
  '#EF4444',
  '#6366F1',
  '#F59E0B',
];

const SOURCE_AR: Record<string, string> = {
  APP: 'من التطبيق',
  MANUAL: 'يدوي',
  CUSTOM: 'يدوي مخصص',
};
const STATUS_AR: Record<string, string> = {
  NEW: 'جديد',
  UNDER_REVIEW: 'تحت المراجعة',
  PRICED: 'مسعّر',
  ACCEPTED: 'مقبول',
  DRIVER_ASSIGNED: 'مع السائق',
  PICKED_UP: 'تم الاستلام',
  IN_ROUTE: 'في الطريق',
  DELIVERED: 'تم التسليم',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي',
  REJECTED: 'مرفوض',
};
const WEEKDAY_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
// Egyptian week reads Saturday-first.
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

const fmtHour = (h: number) => `${h % 12 || 12}${h < 12 ? 'ص' : 'م'}`;

export function AnalyticsSection({ range }: { range: Range }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'analytics', range],
    queryFn: () =>
      api.raw.get('/admin/analytics', { params: { range } }).then((r) => r.data.data as Analytics),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }
  if (!data) return null;

  const k = data.kpis;
  const sourceData = data.bySource.map((s) => ({
    name: SOURCE_AR[s.source] ?? s.source,
    value: s.orders,
    sales: s.sales,
  }));
  const statusData = data.byStatus
    .map((s) => ({ name: STATUS_AR[s.status] ?? s.status, value: s.orders }))
    .sort((a, b) => b.value - a.value);
  const weekdayData = WEEK_ORDER.map((w) => {
    const row = data.byWeekday.find((x) => x.weekday === w);
    return { label: WEEKDAY_AR[w] ?? '', orders: row?.orders ?? 0, sales: row?.sales ?? 0 };
  });
  const hourData = data.byHour.map((h) => ({ label: fmtHour(h.hour), orders: h.orders }));
  const bestDay = [...weekdayData].sort((a, b) => b.orders - a.orders)[0];
  const peakHour = [...data.byHour].sort((a, b) => b.orders - a.orders)[0];

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-black text-brand-dark flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-brand-red" /> تحليلات متقدمة
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          مؤشرات ورسوم بيانية تساعدك تفهم أداء الطلبات وتاخد قرارات دقيقة.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="إجمالي الطلبات" value={formatCount(k.orders)} />
        <Kpi label="المبيعات المكتملة" value={formatMoney(k.sales)} tone="text-emerald-600" />
        <Kpi label="متوسط قيمة الطلب" value={formatMoney(k.avgOrderValue)} />
        <Kpi label="رسوم التوصيل" value={formatMoney(k.delivery)} tone="text-amber-600" />
        <Kpi label="نسبة الإكمال" value={`${k.completionRate}%`} />
        <Kpi label="عملاء جدد" value={formatCount(k.newCustomers)} tone="text-brand-red" />
      </div>

      {/* Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Highlight
          icon={<CalendarDays className="w-5 h-5" />}
          label="أفضل يوم بيع"
          value={bestDay ? bestDay.label : '—'}
          sub={bestDay ? `${formatCount(bestDay.orders)} طلب` : ''}
        />
        <Highlight
          icon={<Clock className="w-5 h-5" />}
          label="وقت الذروة"
          value={peakHour ? fmtHour(peakHour.hour) : '—'}
          sub={peakHour ? `${formatCount(peakHour.orders)} طلب` : ''}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Source */}
        <ChartCard title="مصدر الطلبات" icon={<PieIcon className="w-4 h-4" />}>
          <PieBox data={sourceData} unit="طلب" />
        </ChartCard>

        {/* Status */}
        <ChartCard title="توزيع حالات الطلبات" icon={<PieIcon className="w-4 h-4" />}>
          <PieBox data={statusData} unit="طلب" />
        </ChartCard>

        {/* Weekday */}
        <ChartCard title="أفضل أيام البيع" icon={<CalendarDays className="w-4 h-4" />}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={weekdayData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} reversed />
              <YAxis orientation="right" allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: number, key: string) =>
                  key === 'sales' ? [formatMoney(v), 'مبيعات'] : [formatCount(v), 'طلبات']
                }
              />
              <Bar dataKey="orders" name="طلبات" fill="#E0301E" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Peak hours */}
        <ChartCard title="ساعات الذروة" icon={<Clock className="w-4 h-4" />}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={hourData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={1} reversed />
              <YAxis orientation="right" allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [formatCount(v), 'طلبات']} />
              <Bar dataKey="orders" name="طلبات" fill="#EC7A2C" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Top merchants */}
        <ChartCard title="أعلى المتاجر طلبًا" icon={<Store className="w-4 h-4" />}>
          <RankBars
            rows={data.topMerchants.map((m) => ({ name: m.name, value: m.orders, sub: m.sales }))}
            valueLabel="طلب"
            color="#3B82F6"
          />
        </ChartCard>

        {/* Top products */}
        <ChartCard title="أعلى المنتجات مبيعًا" icon={<Package className="w-4 h-4" />}>
          <RankBars
            rows={data.topProducts.map((p) => ({ name: p.name, value: p.qty, sub: p.sales }))}
            valueLabel="قطعة"
            color="#10B981"
          />
        </ChartCard>
      </div>
    </section>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-lg font-black mt-0.5 ${tone ?? 'text-brand-dark'}`}>{value}</div>
    </div>
  );
}

function Highlight({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-brand-red/5 p-3">
      <div className="w-10 h-10 rounded-lg bg-brand-red/10 text-brand-red flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="text-base font-black text-brand-dark">
          {value} <span className="text-xs font-normal text-muted-foreground">{sub}</span>
        </div>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
      <h3 className="font-bold text-sm mb-3 flex items-center gap-1.5 text-brand-dark">
        <span className="text-brand-red">{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

function PieBox({ data, unit }: { data: { name: string; value: number }[]; unit: string }) {
  if (!data.length || data.every((d) => d.value === 0)) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={45}
          outerRadius={85}
          paddingAngle={2}
          label={(e: { value: number }) => formatCount(e.value)}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number, n: string) => [`${formatCount(v)} ${unit}`, n]} />
        <Legend
          layout="horizontal"
          verticalAlign="bottom"
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function RankBars({
  rows,
  valueLabel,
  color,
}: {
  rows: { name: string; value: number; sub: number }[];
  valueLabel: string;
  color: string;
}) {
  if (!rows.length) return <Empty />;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={`${r.name}-${i}`} className="flex items-center gap-2">
          <span className="w-5 text-xs font-bold text-muted-foreground shrink-0">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-baseline gap-2 mb-1">
              <span className="text-xs font-bold text-brand-dark truncate">{r.name}</span>
              <span className="text-[11px] text-muted-foreground shrink-0">
                {formatCount(r.value)} {valueLabel} · {formatMoney(r.sub)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.round((r.value / max) * 100)}%`, backgroundColor: color }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty() {
  return (
    <div className="h-[240px] flex flex-col items-center justify-center text-muted-foreground">
      <Award className="w-8 h-8 mb-2 opacity-40" />
      <p className="text-sm">لا توجد بيانات كافية في هذه الفترة</p>
    </div>
  );
}
