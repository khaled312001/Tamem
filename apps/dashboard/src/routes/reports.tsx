import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useState } from 'react';
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-brand-dark">التقارير</h1>
      </div>

      <div className="bg-white rounded-xl border border-border p-3 flex gap-1">
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

  const exportCsv = () => {
    if (!data?.series) return;
    const rows = [
      'bucket,orders,revenue',
      ...data.series.map((s: Row) => `${s.bucket},${s.orders},${s.revenue}`),
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
            <div className="text-3xl font-black mt-1">
              {Number(data.total).toLocaleString('ar-EG')} ج.م
            </div>
            <div className="text-xs text-muted-foreground mt-1">{data.ordersCount} طلب مكتمل</div>
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
          {data.series.length === 0 ? (
            <EmptyState title="لا توجد بيانات في هذه الفترة" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.series}>
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

function DriversTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'reports', 'drivers'],
    queryFn: () => api.adminReportDrivers() as Promise<Row[]>,
  });
  if (isLoading) return <CardSkeleton />;
  if (!data?.length) return <EmptyState title="لا توجد بيانات" />;
  return (
    <div className="bg-white rounded-xl border border-border p-5">
      <h3 className="font-bold mb-3">قائمة المتصدّرين (السائقون)</h3>
      <table className="w-full text-sm">
        <thead className="border-b border-border">
          <tr className="text-right">
            <th className="py-2 font-bold">#</th>
            <th className="py-2 font-bold">الاسم</th>
            <th className="py-2 font-bold">الهاتف</th>
            <th className="py-2 font-bold">التوصيلات</th>
            <th className="py-2 font-bold">الإيرادات</th>
            <th className="py-2 font-bold">التقييم</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={d.driverId} className="border-b border-border/30">
              <td className="py-2 font-bold">{i + 1}</td>
              <td className="py-2">{d.name}</td>
              <td className="py-2 text-xs" dir="ltr">
                {d.phone}
              </td>
              <td className="py-2 font-bold">{d.deliveries}</td>
              <td className="py-2">{Number(d.totalRevenue).toLocaleString('ar-EG')} ج.م</td>
              <td className="py-2">{d.rating ? `⭐ ${Number(d.rating).toFixed(1)}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
