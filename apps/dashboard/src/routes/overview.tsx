import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Package, RefreshCw, TrendingUp, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button.js';
import { CardSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';
import { connectSocket } from '../lib/socket.js';
import { playNewOrderSound } from '../lib/sound.js';

const RANGE_OPTIONS = [
  { value: 'today', label: 'اليوم' },
  { value: 'week', label: 'الأسبوع' },
  { value: 'month', label: 'الشهر' },
] as const;

type Range = (typeof RANGE_OPTIONS)[number]['value'];

interface OverviewResponse {
  kpis: {
    totalOrders: number;
    newOrders: number;
    pricedOrders: number;
    activeOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    revenue: number;
    pendingPayments: number;
    activeAlerts: number;
    availableDrivers: number;
    customersCount: number;
  };
  trend: { day: string; orders: number; revenue: number }[];
  ordersByService: {
    serviceId: string;
    serviceName: string;
    category: string | null;
    count: number;
  }[];
}

const AR_WEEKDAYS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

function formatTrendDay(iso: string): string {
  // YYYY-MM-DD → "السبت 4/6" (weekday + day/month) — way more readable.
  const d = new Date(iso + 'T00:00:00');
  return `${AR_WEEKDAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

const PIE_COLORS = ['#E0301E', '#EC7A2C', '#F2A93B', '#3B82F6', '#10B981', '#8B5CF6'];

export function OverviewPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [range, setRange] = useState<Range>('week');

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'overview', range],
    queryFn: () => api.adminOverview(range) as Promise<OverviewResponse>,
  });

  // Realtime: refetch the KPIs on order:new (with toast + sound) AND on every
  // order:status change, since completing an order is what bumps revenue, and
  // we don't want the admin to wonder why the numbers stayed put.
  // Also poll every 30s as a safety net in case a socket event is missed.
  useEffect(() => {
    const socket = connectSocket();
    const refetchOverview = () => qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
    const onNew = (order: { id?: string; orderNumber?: string }) => {
      playNewOrderSound();
      toast('🆕 طلب جديد وصل', {
        description: order?.orderNumber ? `رقم ${order.orderNumber}` : 'يتم تحديث القائمة',
        action: order?.id
          ? { label: 'افتح', onClick: () => navigate(`/orders/${order.id}`) }
          : undefined,
      });
      refetchOverview();
    };
    socket.on('order:new', onNew);
    socket.on('order:status', refetchOverview);
    const poll = setInterval(refetchOverview, 30_000);
    return () => {
      socket.off('order:new', onNew);
      socket.off('order:status', refetchOverview);
      clearInterval(poll);
    };
  }, [qc, navigate]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-brand-dark">نظرة عامة</h1>
          <p className="text-sm text-muted-foreground mt-1">ملخص أداء المنصة</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-white border border-border rounded-lg p-1 flex">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRange(opt.value)}
                className={`px-3 py-1.5 text-sm rounded-md transition ${range === opt.value ? 'bg-brand-red text-white font-bold' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="md" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            تحديث
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="إجمالي الطلبات"
              value={data.kpis.totalOrders}
              icon={<Package className="w-5 h-5" />}
              accent="brand-red"
            />
            <KpiCard
              label="قيد التنفيذ"
              value={data.kpis.activeOrders}
              hint={`${data.kpis.newOrders} جديد، ${data.kpis.pricedOrders} مسعّر`}
              accent="brand-orange"
            />
            <KpiCard
              label="مكتملة"
              value={data.kpis.completedOrders}
              icon={<TrendingUp className="w-5 h-5" />}
              accent="green-600"
            />
            <KpiCard
              label="الإيرادات"
              value={`${data.kpis.revenue.toLocaleString('ar-EG')} ج.م`}
              accent="brand-gold"
            />
            <KpiCard
              label="تنبيهات نشطة"
              value={data.kpis.activeAlerts}
              icon={<AlertTriangle className="w-5 h-5" />}
              accent="destructive"
            />
            <KpiCard label="مدفوعات معلّقة" value={data.kpis.pendingPayments} accent="amber-600" />
            <KpiCard
              label="سائقون متاحون"
              value={data.kpis.availableDrivers}
              accent="emerald-600"
            />
            <KpiCard
              label="إجمالي العملاء"
              value={data.kpis.customersCount}
              icon={<Users className="w-5 h-5" />}
              accent="brand-dark"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white rounded-xl p-5 shadow-sm border border-border">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold">الطلبات خلال آخر 7 أيام</h2>
                <span className="text-xs text-muted-foreground">{data.trend.length} نقطة</span>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={data.trend.map((t) => ({ ...t, dayLabel: formatTrendDay(t.day) }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="dayLabel" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="orders"
                      name="عدد الطلبات"
                      stroke="#E0301E"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
              <h2 className="font-bold mb-4">توزيع الخدمات</h2>
              <div className="h-64">
                {data.ordersByService.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                    لا توجد بيانات
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.ordersByService}
                        dataKey="count"
                        nameKey="serviceName"
                        innerRadius={40}
                        outerRadius={80}
                        label={(entry: { count: number }) => `${entry.count}`}
                      >
                        {data.ordersByService.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number, name: string) => [`${value} طلب`, name]}
                      />
                      <Legend
                        layout="horizontal"
                        verticalAlign="bottom"
                        wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
            <h2 className="font-bold mb-4">الإيرادات اليومية</h2>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.trend.map((t) => ({ ...t, dayLabel: formatTrendDay(t.day) }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="dayLabel" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `${v}`} />
                  <Tooltip
                    formatter={(v: number) => [`${v.toLocaleString('ar-EG')} ج.م`, 'إيرادات']}
                  />
                  <Bar
                    dataKey="revenue"
                    name="إيرادات اليومية"
                    fill="#F2A93B"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  hint,
  accent = 'brand-red',
}: {
  label: string;
  value: number | string;
  icon?: React.ReactNode;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
      <div className="flex items-start justify-between">
        <div className="text-sm text-muted-foreground">{label}</div>
        {icon && <div className={`text-${accent}`}>{icon}</div>}
      </div>
      <div className="text-3xl font-black mt-2">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-2">{hint}</div>}
    </div>
  );
}
