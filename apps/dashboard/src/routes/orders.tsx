import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Eye,
  LayoutGrid,
  Loader2,
  Map as MapIcon,
  Search,
  Truck,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { ORDER_TRANSITIONS, ORDER_STATUS_AR } from '@tamem/types';
import type { OrderStatus } from '@tamem/types';

import { Badge, StatusBadge } from '../components/ui/Badge.js';
import { Button } from '../components/ui/Button.js';
import { Dialog, Drawer } from '../components/ui/Dialog.js';
import { Field, Input, Textarea } from '../components/ui/Input.js';
import { OrdersMap, type OrdersMapOrder } from '../components/OrdersMap.js';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';
import { connectSocket } from '../lib/socket.js';
import { playNewOrderSound } from '../lib/sound.js';

const STATUS_TABS = [
  { value: '', label: 'الكل' },
  { value: 'NEW', label: 'جديدة' },
  { value: 'UNDER_REVIEW', label: 'المراجعة' },
  { value: 'PRICED,AWAITING_CUSTOMER_APPROVAL', label: 'بانتظار العميل' },
  { value: 'ACCEPTED,DRIVER_ASSIGNED,PICKED_UP,IN_ROUTE', label: 'في الطريق' },
  { value: 'COMPLETED', label: 'مكتمل' },
  { value: 'CANCELLED,REJECTED', label: 'ملغي' },
] as const;

// Quick filter presets — preset name + which URL params to set.
const QUICK_FILTERS: {
  key: string;
  label: string;
  icon: React.ReactNode;
  status?: string;
  from?: 'today';
}[] = [
  { key: 'today', label: 'اليوم', icon: <Zap className="w-3.5 h-3.5" />, from: 'today' },
  {
    key: 'pending-pricing',
    label: 'بانتظار تسعير',
    icon: <DollarSign className="w-3.5 h-3.5" />,
    status: 'UNDER_REVIEW',
  },
  {
    key: 'pending-customer',
    label: 'بانتظار العميل',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    status: 'PRICED,AWAITING_CUSTOMER_APPROVAL',
  },
  {
    key: 'on-the-way',
    label: 'في الطريق',
    icon: <Truck className="w-3.5 h-3.5" />,
    status: 'DRIVER_ASSIGNED,PICKED_UP,IN_ROUTE',
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrderRow = any;

export function OrdersPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get('page') ?? 1)));
  const [pageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') ?? '');
  const [fromPreset, setFromPreset] = useState<'today' | undefined>(
    searchParams.get('from') === 'today' ? 'today' : undefined,
  );
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get('search') ?? '');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [quickPriceFor, setQuickPriceFor] = useState<OrderRow | null>(null);
  const [quickAssignFor, setQuickAssignFor] = useState<OrderRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionFor, setBulkActionFor] = useState<OrderStatus | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'map'>(() =>
    searchParams.get('view') === 'map' ? 'map' : 'table',
  );

  // Sync ALL filter state to the URL so reload + browser back/forward work.
  useEffect(() => {
    const next: Record<string, string> = {};
    if (debouncedSearch) next.search = debouncedSearch;
    if (statusFilter) next.status = statusFilter;
    if (fromPreset) next.from = fromPreset;
    if (page > 1) next.page = String(page);
    if (viewMode === 'map') next.view = 'map';
    const current = Object.fromEntries(searchParams.entries());
    const changed =
      Object.keys(next).length !== Object.keys(current).length ||
      Object.entries(next).some(([k, v]) => current[k] !== v);
    if (changed) setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, statusFilter, fromPreset, page, viewMode]);

  // React to the URL changing externally (e.g. header search bar pushes a new query)
  useEffect(() => {
    const fromUrl = searchParams.get('search') ?? '';
    if (fromUrl !== search) {
      setSearch(fromUrl);
      setDebouncedSearch(fromUrl);
      setPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Quick advance to next status (skips drawer entirely)
  const quickAdvance = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
      api.adminUpdateOrderStatus(id, status),
    onSuccess: () => {
      toast.success('تم تحديث الحالة');
      qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Bulk status mutation — used by the floating action bar.
  const bulkStatusMut = useMutation({
    mutationFn: ({ status, reason }: { status: OrderStatus; reason?: string }) =>
      api.adminBulkOrderStatus(Array.from(selectedIds), status, reason),
    onSuccess: (res) => {
      const ok = res.succeeded.length;
      const failed = res.failed.length;
      if (ok > 0 && failed === 0) toast.success(`تم تحديث ${ok} طلب`);
      else if (ok > 0 && failed > 0)
        toast(`تم تحديث ${ok} طلب`, { description: `${failed} طلب فشل تحديثهم` });
      else toast.error('فشل تحديث الطلبات', { description: res.failed[0]?.reason });
      setSelectedIds(new Set());
      setBulkActionFor(null);
      qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Helper: best "next status" suggestion for one-click advance
  const nextStatusFor = (o: OrderRow): OrderStatus | null => {
    const allowed = (ORDER_TRANSITIONS[o.status as OrderStatus] ?? []) as OrderStatus[];
    // Skip terminal/branch states for one-click suggestion
    const candidates = allowed.filter((s) => s !== 'CANCELLED' && s !== 'REJECTED');
    return candidates[0] ?? null;
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = useMemo(() => {
    const p: Record<string, unknown> = { page, pageSize };
    if (statusFilter) p.status = statusFilter; // backend accepts CSV for grouped tabs
    if (debouncedSearch) p.search = debouncedSearch;
    if (fromPreset === 'today') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      p.from = start.toISOString();
    }
    return p;
  }, [page, pageSize, statusFilter, debouncedSearch, fromPreset]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'orders', params],
    queryFn: () => api.adminListOrders(params),
  });

  // Socket: auto refresh + sound + toast action on new orders
  useEffect(() => {
    const socket = connectSocket();
    const refetch = () => qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
    const onNew = (order: { id?: string; orderNumber?: string }) => {
      playNewOrderSound();
      toast('🆕 طلب جديد وصل', {
        description: order?.orderNumber ? `رقم ${order.orderNumber}` : undefined,
        action: order?.id
          ? { label: 'افتح', onClick: () => navigate(`/orders/${order.id}`) }
          : undefined,
      });
      refetch();
    };
    socket.on('order:new', onNew);
    socket.on('order:status', refetch);
    return () => {
      socket.off('order:new', onNew);
      socket.off('order:status', refetch);
    };
  }, [qc, navigate]);

  // Drop selections that fall outside the current page so the bulk bar
  // doesn't claim to act on rows the admin can't see anymore.
  useEffect(() => {
    if (!data?.items.length) return;
    const visibleIds = new Set(data.items.map((o: OrderRow) => o.id));
    setSelectedIds((prev) => {
      const filtered = new Set(Array.from(prev).filter((id) => visibleIds.has(id)));
      return filtered.size === prev.size ? prev : filtered;
    });
  }, [data]);

  const visibleIds = useMemo(
    () => (data?.items ?? []).map((o: OrderRow) => o.id as string),
    [data],
  );
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (visibleIds.every((id) => prev.has(id))) {
        // un-select page only — keep selections from other pages? simpler: clear all
        return new Set();
      }
      const next = new Set(prev);
      visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };
  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedOrders = useMemo<OrderRow[]>(
    () => (data?.items as OrderRow[] | undefined)?.filter((o) => selectedIds.has(o.id)) ?? [],
    [data, selectedIds],
  );

  // Which target statuses are valid for ALL currently selected orders?
  // We intersect the allowed transitions across the selection so admin can't
  // press a button that would fail on half the orders.
  const bulkTargets = useMemo<OrderStatus[]>(() => {
    if (selectedOrders.length === 0) return [];
    let intersect: OrderStatus[] | null = null;
    for (const o of selectedOrders) {
      const allowed = (ORDER_TRANSITIONS[o.status as OrderStatus] ?? []) as readonly OrderStatus[];
      if (intersect === null) {
        intersect = [...allowed];
      } else {
        const allowedSet = new Set<OrderStatus>(allowed);
        intersect = intersect.filter((s) => allowedSet.has(s));
      }
    }
    return intersect ?? [];
  }, [selectedOrders]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-brand-dark">إدارة الطلبات</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.pagination.total ?? 0} طلب إجمالي
          </p>
        </div>
        {/* View toggle: table vs map */}
        <div className="inline-flex border border-border rounded-lg overflow-hidden bg-white">
          <button
            onClick={() => setViewMode('table')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition ${
              viewMode === 'table' ? 'bg-brand-red text-white' : 'text-brand-dark hover:bg-muted'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            جدول
          </button>
          <button
            onClick={() => setViewMode('map')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition ${
              viewMode === 'map' ? 'bg-brand-red text-white' : 'text-brand-dark hover:bg-muted'
            }`}
          >
            <MapIcon className="w-3.5 h-3.5" />
            خريطة
          </button>
        </div>
      </div>

      {/* Quick filter presets */}
      <div className="flex flex-wrap gap-2">
        {QUICK_FILTERS.map((q) => {
          const isActive =
            (q.status ?? '') === statusFilter && (q.from ?? undefined) === fromPreset;
          return (
            <button
              key={q.key}
              onClick={() => {
                setStatusFilter(q.status ?? '');
                setFromPreset(q.from);
                setPage(1);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition border ${
                isActive
                  ? 'bg-brand-red text-white border-brand-red shadow-sm'
                  : 'bg-white text-brand-dark border-border hover:border-brand-red/50 hover:text-brand-red'
              }`}
            >
              {q.icon}
              {q.label}
            </button>
          );
        })}
        {(statusFilter || fromPreset || debouncedSearch) && (
          <button
            onClick={() => {
              setStatusFilter('');
              setFromPreset(undefined);
              setSearch('');
              setDebouncedSearch('');
              setPage(1);
            }}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs text-muted-foreground hover:text-brand-red"
          >
            <X className="w-3 h-3" />
            مسح الفلاتر
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-border p-4 space-y-3">
        <div className="flex gap-2 flex-wrap">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => {
                setStatusFilter(tab.value);
                setFromPreset(undefined);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-sm transition ${statusFilter === tab.value && !fromPreset ? 'bg-brand-red text-white font-bold' : 'bg-muted hover:bg-muted/80'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="بحث برقم الطلب أو اسم/رقم العميل..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-10"
          />
        </div>
      </div>

      {/* Floating bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-16 z-20 bg-brand-red text-white rounded-xl shadow-lg flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-bold">{selectedIds.size} طلب محدد</span>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="opacity-90 hover:opacity-100 inline-flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              إلغاء التحديد
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {bulkTargets.length === 0 ? (
              <span className="text-xs opacity-80">لا توجد حالة مشتركة متاحة</span>
            ) : (
              bulkTargets.map((target) => (
                <button
                  key={target}
                  onClick={() => setBulkActionFor(target)}
                  disabled={bulkStatusMut.isPending}
                  className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-bold inline-flex items-center gap-1 transition"
                >
                  {target === 'CANCELLED' ? (
                    <XCircle className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowRight className="w-3.5 h-3.5" />
                  )}
                  {ORDER_STATUS_AR[target]}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Map view — orders + drivers on a single map */}
      {viewMode === 'map' && (
        <div className="bg-white rounded-xl border border-border p-3">
          {isLoading ? (
            <div className="h-[420px] grid place-items-center text-muted-foreground text-sm">
              جاري تحميل الخريطة...
            </div>
          ) : !data?.items.length ? (
            <EmptyState
              title="لا توجد طلبات لعرضها على الخريطة"
              description="غيّر الفلتر أو انتظر طلبات جديدة."
            />
          ) : (
            <OrdersMap orders={data.items as OrdersMapOrder[]} />
          )}
          <p className="text-xs text-muted-foreground mt-2 text-center">
            النقاط الزرقاء = موقع التوصيل · 🚚 = السائق (يتحدث لحظياً)
          </p>
        </div>
      )}

      {/* Table */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          {isLoading ? (
            <div className="p-6">
              <TableSkeleton rows={8} cols={7} />
            </div>
          ) : !data?.items.length ? (
            <EmptyState
              title="لا توجد طلبات"
              description="جرّب تغيير الفلتر أو انتظر طلبات جديدة."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr className="text-right">
                    <th className="px-3 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someSelected;
                        }}
                        onChange={toggleSelectAll}
                        aria-label="تحديد كل الصفحة"
                        className="w-4 h-4 cursor-pointer accent-brand-red"
                      />
                    </th>
                    <th className="px-4 py-3 font-bold">رقم الطلب</th>
                    <th className="px-4 py-3 font-bold">العميل</th>
                    <th className="px-4 py-3 font-bold">الخدمة</th>
                    <th className="px-4 py-3 font-bold">الحالة</th>
                    <th className="px-4 py-3 font-bold">السعر</th>
                    <th className="px-4 py-3 font-bold">السائق</th>
                    <th className="px-4 py-3 font-bold">التاريخ</th>
                    <th className="px-4 py-3 font-bold text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.items as OrderRow[]).map((o) => {
                    const next = nextStatusFor(o);
                    const isSelected = selectedIds.has(o.id);
                    return (
                      <tr
                        key={o.id}
                        onClick={() => navigate(`/orders/${o.id}`)}
                        className={`border-b border-border/50 hover:bg-muted/30 cursor-pointer ${
                          isSelected ? 'bg-brand-red/5' : ''
                        }`}
                      >
                        <td
                          className="px-3 py-3"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelectOne(o.id);
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(o.id)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label="تحديد الطلب"
                            className="w-4 h-4 cursor-pointer accent-brand-red"
                          />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{o.orderNumber}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{o.customer?.name ?? '—'}</div>
                          <div className="text-xs text-muted-foreground" dir="ltr">
                            {o.customer?.phone ?? ''}
                          </div>
                        </td>
                        <td className="px-4 py-3">{o.service?.nameAr ?? '—'}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={o.status as OrderStatus} />
                        </td>
                        <td className="px-4 py-3">
                          {(o.finalPrice ?? o.quotedPrice)
                            ? `${Number(o.finalPrice ?? o.quotedPrice).toLocaleString('ar-EG')} ج.م`
                            : '—'}
                        </td>
                        <td className="px-4 py-3">{o.assignedDriver?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {new Date(o.createdAt).toLocaleDateString('ar-EG')}
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            {/* Status-aware quick action */}
                            {o.status === 'UNDER_REVIEW' && (
                              <button
                                onClick={() => setQuickPriceFor(o)}
                                title="تسعير سريع"
                                className="p-1.5 rounded-md hover:bg-brand-red/10 text-brand-red"
                              >
                                <DollarSign className="w-4 h-4" />
                              </button>
                            )}
                            {(o.status === 'ACCEPTED' || o.status === 'PRICED') && (
                              <button
                                onClick={() => setQuickAssignFor(o)}
                                title="تعيين سائق"
                                className="p-1.5 rounded-md hover:bg-blue-50 text-blue-600"
                              >
                                <Truck className="w-4 h-4" />
                              </button>
                            )}
                            {next && !['UNDER_REVIEW', 'ACCEPTED', 'PRICED'].includes(o.status) && (
                              <button
                                onClick={() => quickAdvance.mutate({ id: o.id, status: next })}
                                disabled={quickAdvance.isPending}
                                title={`→ ${ORDER_STATUS_AR[next]}`}
                                className="p-1.5 rounded-md hover:bg-green-50 text-green-600"
                              >
                                <ArrowRight className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => navigate(`/orders/${o.id}`)}
                              title="فتح التفاصيل"
                              className="p-1.5 rounded-md hover:bg-muted"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {data && data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
              <div className="text-sm text-muted-foreground">
                صفحة {page} من {data.pagination.totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronRight className="w-4 h-4" />
                  السابق
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= data.pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  التالي
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedOrderId && (
        <OrderDetailDrawer orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} />
      )}

      {quickPriceFor && (
        <PriceDialog
          orderId={quickPriceFor.id}
          onClose={() => {
            setQuickPriceFor(null);
            qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
          }}
        />
      )}
      {quickAssignFor && (
        <AssignDriverDialog
          orderId={quickAssignFor.id}
          onClose={() => {
            setQuickAssignFor(null);
            qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
          }}
        />
      )}

      {bulkActionFor && (
        <BulkConfirmDialog
          targetStatus={bulkActionFor}
          count={selectedIds.size}
          pending={bulkStatusMut.isPending}
          onCancel={() => setBulkActionFor(null)}
          onConfirm={(reason) =>
            bulkStatusMut.mutate({ status: bulkActionFor, reason: reason || undefined })
          }
        />
      )}
    </div>
  );
}

function BulkConfirmDialog({
  targetStatus,
  count,
  pending,
  onCancel,
  onConfirm,
}: {
  targetStatus: OrderStatus;
  count: number;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const needsReason = targetStatus === 'CANCELLED' || targetStatus === 'REJECTED';
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onCancel()}
      title={`تأكيد تحديث ${count} طلب → ${ORDER_STATUS_AR[targetStatus]}`}
    >
      <p className="text-sm text-muted-foreground mb-3">
        سيتم تطبيق التغيير على جميع الطلبات المحددة. الطلبات التي حالتها لا تسمح بهذا الانتقال سيتم
        تخطيها.
      </p>
      <Field label={needsReason ? 'السبب' : 'سبب اختياري'} required={needsReason}>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder={needsReason ? 'اكتب السبب...' : 'مثال: دفعة موافقات إدارية'}
        />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" size="md" onClick={onCancel}>
          تراجع
        </Button>
        <Button
          variant={
            targetStatus === 'CANCELLED' || targetStatus === 'REJECTED' ? 'danger' : 'primary'
          }
          disabled={(needsReason && reason.trim().length < 2) || pending}
          onClick={() => onConfirm(reason.trim())}
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          تأكيد على {count} طلب
        </Button>
      </div>
    </Dialog>
  );
}

function OrderDetailDrawer({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: order, isLoading } = useQuery({
    queryKey: ['admin', 'order', orderId],
    queryFn: () => api.adminGetOrder(orderId) as Promise<OrderRow>,
  });

  const [priceOpen, setPriceOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
    qc.invalidateQueries({ queryKey: ['admin', 'order', orderId] });
  };

  const updateStatusMut = useMutation({
    mutationFn: (status: OrderStatus) => api.adminUpdateOrderStatus(orderId, status),
    onSuccess: () => {
      toast.success('تم تحديث الحالة');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!order && !isLoading) return null;

  const allowedTransitions = order ? (ORDER_TRANSITIONS[order.status as OrderStatus] ?? []) : [];

  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title={order?.orderNumber ?? '...'}>
      {isLoading || !order ? (
        <TableSkeleton rows={6} cols={1} />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <StatusBadge status={order.status} size="md" />
            <div className="text-sm text-muted-foreground">
              {new Date(order.createdAt).toLocaleString('ar-EG')}
            </div>
          </div>

          <Section title="العميل">
            <div className="font-bold">{order.customer?.name}</div>
            <div className="text-sm" dir="ltr">
              <a href={`tel:${order.customer?.phone}`} className="text-brand-red underline">
                {order.customer?.phone}
              </a>
            </div>
            {order.customer?.city && (
              <div className="text-sm text-muted-foreground">{order.customer.city}</div>
            )}
          </Section>

          {order.deliveryAddress && (
            <Section title="عنوان التوصيل">
              <div>{order.deliveryAddress}</div>
            </Section>
          )}

          {order.pickupAddress && (
            <Section title="عنوان الاستلام">
              <div>{order.pickupAddress}</div>
            </Section>
          )}

          {order.notes && (
            <Section title="تفاصيل الطلب">
              <div className="whitespace-pre-wrap">{order.notes}</div>
            </Section>
          )}

          {Array.isArray(order.items) && order.items.length > 0 && (
            <Section title={`المنتجات (${order.items.length})`}>
              <ul className="space-y-1">
                {order.items.map((it: OrderRow, i: number) => (
                  <li key={i} className="flex justify-between text-sm">
                    <span>
                      {it.quantity} × {it.productNameSnapshot}
                    </span>
                    {it.unitPriceSnapshot && (
                      <span className="text-muted-foreground">
                        {(Number(it.unitPriceSnapshot) * it.quantity).toLocaleString('ar-EG')} ج.م
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="التسعير">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-muted-foreground">السعر المعروض</div>
                <div className="font-bold">
                  {order.quotedPrice
                    ? `${Number(order.quotedPrice).toLocaleString('ar-EG')} ج.م`
                    : '—'}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">السعر النهائي</div>
                <div className="font-bold">
                  {order.finalPrice
                    ? `${Number(order.finalPrice).toLocaleString('ar-EG')} ج.م`
                    : '—'}
                </div>
              </div>
            </div>
          </Section>

          {order.assignedDriver && (
            <Section title="السائق المسند">
              <div className="font-bold">{order.assignedDriver.name}</div>
              <div className="text-sm" dir="ltr">
                {order.assignedDriver.phone}
              </div>
              {order.assignedDriver.driverProfile && (
                <Badge>
                  {order.assignedDriver.driverProfile.vehicleType}{' '}
                  {order.assignedDriver.driverProfile.vehiclePlate}
                </Badge>
              )}
            </Section>
          )}

          {Array.isArray(order.statusHistory) && order.statusHistory.length > 0 && (
            <Section title="السجل">
              <ol className="space-y-2">
                {order.statusHistory.map((h: OrderRow) => (
                  <li key={h.id} className="border-l-2 border-brand-red ps-3 text-sm">
                    <div className="flex items-center gap-2">
                      {h.fromStatus !== h.toStatus ? (
                        <>
                          <StatusBadge status={h.fromStatus} />
                          <span>←</span>
                          <StatusBadge status={h.toStatus} />
                        </>
                      ) : (
                        <Badge>ملاحظة</Badge>
                      )}
                    </div>
                    {h.reason && (
                      <div className="text-muted-foreground mt-1 text-xs">{h.reason}</div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      {h.changedBy?.name ?? ''} · {new Date(h.createdAt).toLocaleString('ar-EG')}
                    </div>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          <Section title="إجراءات">
            <div className="flex flex-wrap gap-2">
              {order.status === 'UNDER_REVIEW' && (
                <Button onClick={() => setPriceOpen(true)}>تسعير</Button>
              )}
              {order.status === 'ACCEPTED' && (
                <Button onClick={() => setAssignOpen(true)}>تعيين سائق</Button>
              )}
              <Button variant="outline" size="md" onClick={() => setNoteOpen(true)}>
                إضافة ملاحظة
              </Button>
              {allowedTransitions
                .filter((s) => s !== 'CANCELLED')
                .map((s) => (
                  <Button
                    key={s}
                    variant="outline"
                    size="sm"
                    onClick={() => updateStatusMut.mutate(s)}
                    disabled={updateStatusMut.isPending}
                  >
                    {updateStatusMut.isPending && <Loader2 className="w-3 h-3 animate-spin" />}→{' '}
                    {ORDER_STATUS_AR[s]}
                  </Button>
                ))}
              {allowedTransitions.includes('CANCELLED' as OrderStatus) && (
                <Button variant="danger" size="sm" onClick={() => setCancelOpen(true)}>
                  إلغاء
                </Button>
              )}
            </div>
          </Section>
        </div>
      )}

      {priceOpen && order && (
        <PriceDialog
          orderId={order.id}
          onClose={() => {
            setPriceOpen(false);
            invalidate();
          }}
        />
      )}
      {assignOpen && order && (
        <AssignDriverDialog
          orderId={order.id}
          onClose={() => {
            setAssignOpen(false);
            invalidate();
          }}
        />
      )}
      {cancelOpen && order && (
        <CancelDialog
          orderId={order.id}
          onClose={() => {
            setCancelOpen(false);
            invalidate();
          }}
        />
      )}
      {noteOpen && order && (
        <NoteDialog
          orderId={order.id}
          onClose={() => {
            setNoteOpen(false);
            invalidate();
          }}
        />
      )}
    </Drawer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-muted/30 rounded-lg p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-2">
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function PriceDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [price, setPrice] = useState('');
  const mut = useMutation({
    mutationFn: () => api.adminSetPrice(orderId, Number(price)),
    onSuccess: () => {
      toast.success('تم تسعير الطلب');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="تسعير الطلب">
      <Field label="السعر بالجنيه" htmlFor="price" required>
        <Input
          id="price"
          type="number"
          inputMode="numeric"
          min={1}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" size="md" onClick={onClose}>
          إلغاء
        </Button>
        <Button onClick={() => mut.mutate()} disabled={!price || mut.isPending}>
          {mut.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
          حفظ السعر
        </Button>
      </div>
    </Dialog>
  );
}

function AssignDriverDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { data: drivers } = useQuery({
    queryKey: ['admin', 'drivers', 'available'],
    queryFn: () => api.adminListDrivers({ status: 'AVAILABLE', pageSize: 50 }),
  });
  const [driverId, setDriverId] = useState('');
  const mut = useMutation({
    mutationFn: () => api.adminAssignDriver(orderId, driverId),
    onSuccess: () => {
      toast.success('تم تعيين السائق');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="تعيين سائق">
      <Field label="السائق" required>
        <select
          value={driverId}
          onChange={(e) => setDriverId(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-input bg-white text-sm"
        >
          <option value="">— اختر —</option>
          {(drivers?.items as OrderRow[] | undefined)?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} — {d.driverProfile?.vehicleType} {d.driverProfile?.vehiclePlate}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" size="md" onClick={onClose}>
          إلغاء
        </Button>
        <Button onClick={() => mut.mutate()} disabled={!driverId || mut.isPending}>
          تعيين
        </Button>
      </div>
    </Dialog>
  );
}

function CancelDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const mut = useMutation({
    mutationFn: () => api.adminCancelOrder(orderId, reason),
    onSuccess: () => {
      toast.success('تم إلغاء الطلب');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="إلغاء الطلب">
      <Field label="السبب" required>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="اكتب سبب الإلغاء..."
        />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" size="md" onClick={onClose}>
          تراجع
        </Button>
        <Button
          variant="danger"
          onClick={() => mut.mutate()}
          disabled={reason.length < 2 || mut.isPending}
        >
          تأكيد الإلغاء
        </Button>
      </div>
    </Dialog>
  );
}

function NoteDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [note, setNote] = useState('');
  const mut = useMutation({
    mutationFn: () => api.adminAddOrderNote(orderId, note),
    onSuccess: () => {
      toast.success('تمت إضافة الملاحظة');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="إضافة ملاحظة داخلية">
      <Field label="الملاحظة" required>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" size="md" onClick={onClose}>
          إلغاء
        </Button>
        <Button onClick={() => mut.mutate()} disabled={!note || mut.isPending}>
          إضافة
        </Button>
      </div>
    </Dialog>
  );
}
