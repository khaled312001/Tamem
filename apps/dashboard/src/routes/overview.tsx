import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Inbox,
  Loader2,
  Package,
  RefreshCw,
  Tag,
  Truck,
  Users,
  XCircle,
} from 'lucide-react';
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
import { PageHeader } from '../components/ui/PageHeader.js';
import { CardSkeleton } from '../components/ui/Skeleton.js';
import { StatCard } from '../components/ui/StatCard.js';
import { ErrorState } from '../components/ui/States.js';
import { api } from '../lib/api.js';
import { formatCount, formatMoney, formatWeekdayDate } from '../lib/format.js';
import { connectSocket } from '../lib/socket.js';
import { playNewOrderSound } from '../lib/sound.js';

const RANGE_OPTIONS = [
  { value: 'today', label: 'اليوم' },
  { value: 'week', label: 'آخر ٧ أيام' },
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

const RANGE_LABEL: Record<Range, string> = {
  today: 'اليوم',
  week: 'آخر ٧ أيام',
  month: 'هذا الشهر',
};

const PIE_COLORS = ['#E0301E', '#EC7A2C', '#F2A93B', '#3B82F6', '#10B981', '#8B5CF6'];

export function OverviewPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [range, setRange] = useState<Range>('week');

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'overview', range],
    queryFn: () => api.adminOverview(range) as Promise<OverviewResponse>,
  });

  // Realtime: refetch KPIs on new orders (toast + sound) and status changes.
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

  const k = data?.kpis;
  const trendData = (data?.trend ?? []).map((t) => ({ ...t, dayLabel: formatWeekdayDate(t.day) }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="نظرة عامة"
        subtitle="ملخص التشغيل والأداء"
        actions={
          <>
            <div className="bg-card border border-border rounded-lg p-1 flex">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setRange(opt.value)}
                  className={`px-3 py-1.5 text-sm rounded-md transition ${
                    range === opt.value
                      ? 'bg-brand-red text-white font-bold'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
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
          </>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : k ? (
        <>
          {/* ── يحتاج إجراء — بطاقات قابلة للنقر تنقل للقائمة المفلترة ── */}
          <section className="space-y-2">
            <h2 className="text-sm font-black text-brand-dark flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-brand-red" /> يحتاج إجراء
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <StatCard
                label="طلبات جديدة"
                value={formatCount(k.newOrders)}
                icon={Inbox}
                tone="blue"
                emphasis
                to="/orders?status=NEW"
                hint="بحاجة لتسعير"
              />
              <StatCard
                label="بانتظار موافقة"
                value={formatCount(k.pricedOrders)}
                icon={Tag}
                tone="sky"
                emphasis
                to="/orders?status=PRICED"
                hint="تم تسعيرها"
              />
              <StatCard
                label="تنبيهات نشطة"
                value={formatCount(k.activeAlerts)}
                icon={AlertTriangle}
                tone="red"
                emphasis
                to="/alerts"
              />
              <StatCard
                label="مدفوعات معلّقة"
                value={formatCount(k.pendingPayments)}
                icon={CreditCard}
                tone="amber"
                emphasis
                to="/payments"
              />
              <StatCard
                label="سائقون متاحون"
                value={formatCount(k.availableDrivers)}
                icon={Truck}
                tone="green"
                emphasis
                to="/drivers"
              />
            </div>
          </section>

          {/* ── ملخص الفترة ── */}
          <section className="space-y-2">
            <h2 className="text-sm font-black text-muted-foreground">ملخص {RANGE_LABEL[range]}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard
                label="إجمالي الطلبات"
                value={formatCount(k.totalOrders)}
                icon={Package}
                tone="zinc"
                to="/orders"
              />
              <StatCard
                label="قيد التنفيذ"
                value={formatCount(k.activeOrders)}
                icon={Truck}
                tone="cyan"
                to="/orders?status=DRIVER_ASSIGNED"
              />
              <StatCard
                label="مكتملة"
                value={formatCount(k.completedOrders)}
                icon={CheckCircle2}
                tone="green"
                to="/orders?status=COMPLETED"
              />
              <StatCard
                label="ملغاة"
                value={formatCount(k.cancelledOrders)}
                icon={XCircle}
                tone="zinc"
                to="/orders?status=CANCELLED"
              />
              <StatCard
                label="الإيرادات"
                value={formatMoney(k.revenue)}
                icon={CreditCard}
                tone="amber"
              />
              <StatCard
                label="العملاء"
                value={formatCount(k.customersCount)}
                icon={Users}
                tone="purple"
                to="/customers"
              />
            </div>
          </section>

          {/* ── الرسوم ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-card rounded-xl p-5 shadow-sm border border-border">
              <h2 className="font-bold mb-4">الطلبات — {RANGE_LABEL[range]}</h2>
              <div className="h-64">
                {trendData.length === 0 ? (
                  <QuietDay />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis dataKey="dayLabel" tick={{ fontSize: 11 }} reversed />
                      <YAxis
                        allowDecimals={false}
                        orientation="right"
                        tickFormatter={(v) => formatCount(v)}
                      />
                      <Tooltip formatter={(v: number) => [formatCount(v), 'طلبات']} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="orders"
                        name="عدد الطلبات"
                        stroke="#E0301E"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="bg-card rounded-xl p-5 shadow-sm border border-border">
              <h2 className="font-bold mb-4">توزيع الخدمات</h2>
              <div className="h-64">
                {data.ordersByService.length === 0 ? (
                  <QuietDay />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.ordersByService}
                        dataKey="count"
                        nameKey="serviceName"
                        innerRadius={40}
                        outerRadius={80}
                        label={(e: { count: number }) => formatCount(e.count)}
                      >
                        {data.ordersByService.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          `${formatCount(value)} طلب`,
                          name,
                        ]}
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

          <div className="bg-card rounded-xl p-5 shadow-sm border border-border">
            <h2 className="font-bold mb-4">الإيرادات — {RANGE_LABEL[range]}</h2>
            <div className="h-48">
              {trendData.length === 0 ? (
                <QuietDay />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="dayLabel" tick={{ fontSize: 11 }} reversed />
                    <YAxis orientation="right" tickFormatter={(v) => formatCount(v)} />
                    <Tooltip formatter={(v: number) => [formatMoney(v), 'إيرادات']} />
                    <Bar dataKey="revenue" name="إيرادات" fill="#F2A93B" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function QuietDay() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground">
      <CheckCircle2 className="w-8 h-8 mb-2 opacity-40" />
      <p className="text-sm">لا توجد بيانات في هذه الفترة</p>
    </div>
  );
}
