import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ORDER_TRANSITIONS, ORDER_STATUS_AR } from '@tamem/types';
import type { OrderStatus } from '@tamem/types';

import { Badge, StatusBadge } from '../components/ui/Badge.js';
import { Button } from '../components/ui/Button.js';
import { Dialog, Drawer } from '../components/ui/Dialog.js';
import { Field, Input, Textarea } from '../components/ui/Input.js';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';
import { connectSocket } from '../lib/socket.js';

const STATUS_TABS = [
  { value: '', label: 'الكل' },
  { value: 'NEW', label: 'جديدة' },
  { value: 'UNDER_REVIEW', label: 'المراجعة' },
  { value: 'PRICED,AWAITING_CUSTOMER_APPROVAL', label: 'بانتظار العميل' },
  { value: 'ACCEPTED,DRIVER_ASSIGNED,PICKED_UP,IN_ROUTE', label: 'في الطريق' },
  { value: 'COMPLETED', label: 'مكتمل' },
  { value: 'CANCELLED,REJECTED', label: 'ملغي' },
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrderRow = any;

export function OrdersPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = useMemo(() => {
    const p: Record<string, unknown> = { page, pageSize };
    if (statusFilter) p.status = statusFilter; // backend accepts CSV for grouped tabs
    if (debouncedSearch) p.search = debouncedSearch;
    return p;
  }, [page, pageSize, statusFilter, debouncedSearch]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'orders', params],
    queryFn: () => api.adminListOrders(params),
  });

  // Socket: auto refresh on order events
  useEffect(() => {
    const socket = connectSocket();
    const refetch = () => qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
    socket.on('order:new', refetch);
    socket.on('order:status', refetch);
    return () => {
      socket.off('order:new', refetch);
      socket.off('order:status', refetch);
    };
  }, [qc]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-brand-dark">إدارة الطلبات</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.pagination.total ?? 0} طلب إجمالي
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-border p-4 space-y-3">
        <div className="flex gap-2 flex-wrap">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => {
                setStatusFilter(tab.value);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-sm transition ${statusFilter === tab.value ? 'bg-brand-red text-white font-bold' : 'bg-muted hover:bg-muted/80'}`}
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

      {/* Table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton rows={8} cols={7} />
          </div>
        ) : !data?.items.length ? (
          <EmptyState title="لا توجد طلبات" description="جرّب تغيير الفلتر أو انتظر طلبات جديدة." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr className="text-right">
                  <th className="px-4 py-3 font-bold">رقم الطلب</th>
                  <th className="px-4 py-3 font-bold">العميل</th>
                  <th className="px-4 py-3 font-bold">الخدمة</th>
                  <th className="px-4 py-3 font-bold">الحالة</th>
                  <th className="px-4 py-3 font-bold">السعر</th>
                  <th className="px-4 py-3 font-bold">السائق</th>
                  <th className="px-4 py-3 font-bold">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {(data.items as OrderRow[]).map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => setSelectedOrderId(o.id)}
                    className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                  >
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
                  </tr>
                ))}
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

      {selectedOrderId && (
        <OrderDetailDrawer orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} />
      )}
    </div>
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
