import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock,
  DollarSign,
  Edit3,
  FileSearch,
  ImageIcon,
  Loader2,
  MapPin,
  MessageSquare,
  Mic,
  Package,
  Phone,
  Plus,
  Trash2,
  Truck,
  User,
  UserCheck,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { ORDER_STATUS_AR, ORDER_TRANSITIONS, type OrderStatus } from '@tamem/types';

import { Badge, StatusBadge } from '../components/ui/Badge.js';
import { Button } from '../components/ui/Button.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Field, Input, Textarea } from '../components/ui/Input.js';
import { CardSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Order = any;

// ────────────────────────────────────────────────────────────────────────────
// Workflow definition — the 4 major stages an order moves through, shown in
// the status strip. Granular state transitions (12 enum values) still live
// in the backend FSM and surface in the audit log; this strip is the human-
// readable view the admin scans at a glance.
// ────────────────────────────────────────────────────────────────────────────

interface MajorStage {
  label: string;
  short: string;
  Icon: typeof Clock;
}

const MAJOR_STAGES: MajorStage[] = [
  { label: 'استلام الطلب', short: 'استلام', Icon: ClipboardCheck },
  { label: 'تم التأكيد', short: 'مؤكد', Icon: CheckCircle2 },
  { label: 'في الطريق', short: 'متجه', Icon: Truck },
  { label: 'تم التسليم', short: 'تم', Icon: CheckCheck },
];

/**
 * Map a granular FSM status to the major-stage index (0..3) the order is
 * currently in. CANCELLED / REJECTED return -1 so the stepper renders all
 * stages as inactive grey when the strip caller passes terminalKind.
 */
function majorStageIndexFor(status: OrderStatus): number {
  switch (status) {
    case 'NEW':
    case 'UNDER_REVIEW':
    case 'PRICED':
    case 'AWAITING_CUSTOMER_APPROVAL':
      return 0;
    case 'ACCEPTED':
    case 'DRIVER_ASSIGNED':
      return 1;
    case 'PICKED_UP':
    case 'IN_ROUTE':
      return 2;
    case 'DELIVERED':
    case 'COMPLETED':
      return 3;
    case 'CANCELLED':
    case 'REJECTED':
      return -1;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Phase model — the admin only ever needs to do 4 things to take an order
// from intake to delivered. We collapse the 9-state happy path into these
// 4 big quick-action cards. The underlying transitions still happen on the
// server (often via multiple PATCH calls), keeping the audit history intact.
// ────────────────────────────────────────────────────────────────────────────
type PhaseId = 1 | 2 | 3 | 4;

interface Phase {
  id: PhaseId;
  label: string;
  Icon: typeof Clock;
  /** Tailwind tone — colored card per phase to make scanning fast. */
  tone: {
    base: string;
    current: string;
    done: string;
  };
}

const PHASES: Phase[] = [
  {
    id: 1,
    label: 'بدء المراجعة + تسعير',
    Icon: ClipboardCheck,
    tone: {
      base: 'border-amber-200 bg-amber-50 text-amber-900',
      current: 'border-amber-500 bg-amber-100 ring-2 ring-amber-400/40 text-amber-900',
      done: 'border-amber-200 bg-white text-amber-700/70',
    },
  },
  {
    id: 2,
    label: 'قبول الطلب',
    Icon: CheckCircle2,
    tone: {
      base: 'border-blue-200 bg-blue-50 text-blue-900',
      current: 'border-blue-500 bg-blue-100 ring-2 ring-blue-400/40 text-blue-900',
      done: 'border-blue-200 bg-white text-blue-700/70',
    },
  },
  {
    id: 3,
    label: 'تعيين سائق + بدء التوصيل',
    Icon: Truck,
    tone: {
      base: 'border-purple-200 bg-purple-50 text-purple-900',
      current: 'border-purple-500 bg-purple-100 ring-2 ring-purple-400/40 text-purple-900',
      done: 'border-purple-200 bg-white text-purple-700/70',
    },
  },
  {
    id: 4,
    label: 'إكمال الطلب',
    Icon: CheckCheck,
    tone: {
      base: 'border-green-200 bg-green-50 text-green-900',
      current: 'border-green-500 bg-green-100 ring-2 ring-green-400/40 text-green-900',
      done: 'border-green-200 bg-white text-green-700/70',
    },
  },
];

/**
 * Map an order status to the phase it currently belongs to. Anything before
 * phase N's terminal status means N is "current" or earlier; the rest are
 * done. Terminal/cancelled states sit "after" all phases.
 */
function currentPhaseFor(status: OrderStatus): PhaseId | 'done' | 'cancelled' {
  switch (status) {
    case 'NEW':
    case 'UNDER_REVIEW':
      return 1;
    case 'PRICED':
    case 'AWAITING_CUSTOMER_APPROVAL':
      return 2;
    case 'ACCEPTED':
      return 3;
    case 'DRIVER_ASSIGNED':
    case 'PICKED_UP':
    case 'IN_ROUTE':
    case 'DELIVERED':
      return 4;
    case 'COMPLETED':
      return 'done';
    case 'CANCELLED':
    case 'REJECTED':
      return 'cancelled';
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: order, isLoading } = useQuery({
    queryKey: ['admin', 'order', id],
    queryFn: () => api.adminGetOrder(id!) as Promise<Order>,
    enabled: !!id,
  });

  type DialogState = null | {
    kind: 'price' | 'assign' | 'cancel' | 'note';
    /** Status to advance to after the dialog completes successfully — used
     *  by the NextActionCard to chain "price + accept" and "assign + start
     *  delivery" into single major-stage actions. */
    after?: OrderStatus;
  };
  const [dialog, setDialog] = useState<DialogState>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
    qc.invalidateQueries({ queryKey: ['admin', 'order', id] });
  };

  // Direct status advance — used by phase-2 (PRICED → ACCEPTED) and by the
  // sequential completion walk below. Always invalidate on success so the
  // cached order/list reflects the new status; otherwise the next click
  // sees the old status and tries to transition to the same state
  // ("Cannot transition from ACCEPTED to ACCEPTED").
  const advanceMut = useMutation({
    mutationFn: (status: OrderStatus) => api.adminUpdateOrderStatus(id!, status),
    onSuccess: () => invalidate(),
    onError: (err: Error) => toast.error(err.message),
  });

  /**
   * Phase 4 is a "skip the intermediate states" button. The state machine
   * doesn't allow jumps (DRIVER_ASSIGNED → COMPLETED would be rejected), so
   * we walk the lifecycle on the client. Each PATCH is recorded as a
   * separate status-history row, which is exactly what we want for the
   * audit log.
   */
  const completeMut = useMutation({
    mutationFn: async (from: OrderStatus) => {
      const walk: OrderStatus[] = ['DRIVER_ASSIGNED', 'PICKED_UP', 'IN_ROUTE', 'DELIVERED'];
      const startIdx = walk.indexOf(from);
      const tail: OrderStatus[] =
        startIdx >= 0
          ? walk.slice(startIdx + 1)
          : (['PICKED_UP', 'IN_ROUTE', 'DELIVERED'] as OrderStatus[]);
      const remaining: OrderStatus[] = [...tail, 'COMPLETED'];
      for (const next of remaining) {
        await api.adminUpdateOrderStatus(id!, next);
      }
    },
    onSuccess: () => {
      toast.success('تم إكمال الطلب');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  /** Walk from PICKED_UP/IN_ROUTE → DELIVERED (stops short of COMPLETED so
   *  the admin can confirm finalization as a separate, explicit step). */
  const markDeliveredMut = useMutation({
    mutationFn: async (from: OrderStatus) => {
      const walk: OrderStatus[] = ['PICKED_UP', 'IN_ROUTE', 'DELIVERED'];
      const startIdx = walk.indexOf(from);
      const remaining = startIdx >= 0 ? walk.slice(startIdx + 1) : (['DELIVERED'] as OrderStatus[]);
      for (const next of remaining) {
        await api.adminUpdateOrderStatus(id!, next);
      }
    },
    onSuccess: () => {
      toast.success('تم تأكيد التسليم');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !order) {
    return (
      <div className="space-y-4">
        <BackBar onBack={() => navigate('/orders')} />
        <CardSkeleton />
      </div>
    );
  }

  const status = order.status as OrderStatus;
  const isTerminal = status === 'COMPLETED' || status === 'CANCELLED' || status === 'REJECTED';
  const canCancel = (ORDER_TRANSITIONS[status] as readonly OrderStatus[]).includes('CANCELLED');
  const hasPrice = order.quotedPrice != null || order.finalPrice != null;
  const phase = currentPhaseFor(status);
  void phase;

  const phasePending = advanceMut.isPending || completeMut.isPending || markDeliveredMut.isPending;

  // Kept around because the action dialogs (price, assign, complete) reuse
  // the same dispatching logic. The 4-card overview UI it used to render
  // alongside is gone; the detailed timeline is now the sole progress view.
  // void at the end suppresses tsc's noUnusedLocals without removing the
  // helper outright (we'll likely revive a compact phase summary later).
  // Legacy 4-card phase dispatcher — kept around for potential revival.
  // The NextActionCard below now owns admin progression.
  const onPhaseClick = (id: PhaseId) => {
    if (phasePending) return;
    if (id === 1) {
      setDialog({ kind: 'price' });
      return;
    }
    if (id === 2) {
      advanceMut.mutate('ACCEPTED', {
        onSuccess: () => {
          toast.success('تم قبول الطلب');
          invalidate();
        },
      });
      return;
    }
    if (id === 3) {
      setDialog({ kind: 'assign' });
      return;
    }
    if (id === 4) {
      completeMut.mutate(status);
      return;
    }
  };
  void onPhaseClick;

  const customData = order.customData as Record<string, unknown> | undefined;

  // ── Media extraction (unchanged from prior version) ──────────────────────
  const BASE64_RE = /^[A-Za-z0-9+/]{500,}={0,2}$/;
  const looksLikeBase64Image = (v: unknown): v is string =>
    typeof v === 'string' && BASE64_RE.test(v);
  const normalizeImage = (v: string): string => {
    if (
      v.startsWith('data:') ||
      v.startsWith('http') ||
      v.startsWith('blob:') ||
      v.startsWith('file:')
    ) {
      return v;
    }
    if (looksLikeBase64Image(v)) return `data:image/jpeg;base64,${v}`;
    return v;
  };
  const isImageRef = (v: unknown): v is string =>
    typeof v === 'string' &&
    (v.startsWith('data:image/') ||
      v.startsWith('blob:') ||
      v.startsWith('file://') ||
      /\.(jpe?g|png|webp|gif|svg)(\?|$)/i.test(v) ||
      /^https?:\/\/.+\/uploads\//i.test(v) ||
      looksLikeBase64Image(v));
  const isAudioRef = (v: unknown): v is string =>
    typeof v === 'string' &&
    (v.startsWith('data:audio/') ||
      (v.startsWith('blob:') &&
        (customData?.audioMime as string | undefined)?.startsWith('audio')) ||
      /\.(mp3|m4a|wav|webm|ogg|aac)(\?|$)/i.test(v));
  const collectedImages: string[] = [];
  const collectedAudio: string[] = [];
  const pushFrom = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(pushFrom);
    else if (isAudioRef(v)) collectedAudio.push(v);
    else if (isImageRef(v)) collectedImages.push(normalizeImage(v));
  };
  if (Array.isArray(order.imageUrls)) (order.imageUrls as string[]).forEach(pushFrom);
  if (customData) for (const v of Object.values(customData)) pushFrom(v);
  const imageUrls = Array.from(new Set(collectedImages));
  const audioUri = collectedAudio[0];
  const renderedKeys = new Set<string>();
  if (customData) {
    for (const [k, v] of Object.entries(customData)) {
      if (
        Array.isArray(v)
          ? v.some((x) => isImageRef(x) || isAudioRef(x))
          : isImageRef(v) || isAudioRef(v)
      ) {
        renderedKeys.add(k);
      }
    }
  }
  ['audioUri', 'audioMime', 'audioDurationMs', 'quickOrder', 'mode', 'imageUrls'].forEach((k) =>
    renderedKeys.add(k),
  );

  return (
    <div className="space-y-4">
      <BackBar onBack={() => navigate('/orders')} />

      {/* ───────── Multi-merchant linkage banners ───────── */}
      {order.parentOrder && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <ChevronRight className="w-6 h-6 text-amber-700 rotate-180 mt-0.5" />
          <div className="flex-1">
            <div className="font-bold text-amber-900">هذا الطلب جزء من سلة متعددة المتاجر</div>
            <div className="text-sm text-amber-800 mt-1">
              العميل عمل checkout واحد وانقسم لكذا طلب (تاجر لكل واحد). افتح الطلب الأصلي لتشوف باقي
              طلبات نفس السلة.
            </div>
            <button
              onClick={() => navigate(`/orders/${order.parentOrder.id}`)}
              className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded bg-amber-600 text-white font-bold text-sm hover:bg-amber-700"
            >
              فتح الطلب الأصلي #{order.parentOrder.orderNumber}
            </button>
          </div>
        </div>
      )}
      {Array.isArray(order.siblings) && order.siblings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="font-bold text-amber-900 mb-2">طلبات أخرى من نفس السلة:</div>
          <div className="flex flex-wrap gap-2">
            {order.siblings.map((s: { id: string; orderNumber: string; status: string }) => (
              <button
                key={s.id}
                onClick={() => navigate(`/orders/${s.id}`)}
                className="px-2 py-1 rounded bg-white border border-amber-300 text-sm font-mono hover:bg-amber-100"
              >
                #{s.orderNumber} · {ORDER_STATUS_AR[s.status as OrderStatus] ?? s.status}
              </button>
            ))}
          </div>
        </div>
      )}
      {Array.isArray(order.subOrders) && order.subOrders.length > 0 && (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 bg-brand-red/5 border-b border-brand-red/20">
            <div className="font-bold text-brand-dark flex items-center gap-2">
              <Package className="w-4 h-4 text-brand-red" />
              سلة متعددة المتاجر
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-brand-red/10 text-brand-red">
                {order.subOrders.length} تجار
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              هذا هو الطلب الأصلي. كل تاجر له طلب فرعي مع سائقه وحالته. الدفع والإجمالي موحّدين هنا.
            </div>
          </div>
          <div className="divide-y divide-border">
            {order.subOrders.map(
              (sub: {
                id: string;
                orderNumber: string;
                status: string;
                merchantSubtotal: number | null;
                quotedPrice: number | null;
                finalPrice: number | null;
                paymentStatus: string | null;
                assignedDriver: { name: string; phone?: string } | null;
                items: { productNameSnapshot: string; quantity: number }[];
                merchant: { id: string; storeNameAr: string; logoUrl: string | null } | null;
              }) => {
                const total = sub.finalPrice ?? sub.merchantSubtotal ?? sub.quotedPrice;
                return (
                  <div
                    key={sub.id}
                    onClick={() => navigate(`/orders/${sub.id}`)}
                    className="p-4 hover:bg-muted/30 cursor-pointer flex items-start gap-3"
                  >
                    {sub.merchant?.logoUrl ? (
                      <img
                        src={sub.merchant.logoUrl}
                        alt={sub.merchant.storeNameAr}
                        className="w-10 h-10 rounded-lg object-cover border border-border shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-brand-orange/10 text-brand-orange flex items-center justify-center font-bold shrink-0">
                        {sub.merchant?.storeNameAr?.[0] ?? '?'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">
                          {sub.merchant?.storeNameAr ?? 'تاجر غير معروف'}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          #{sub.orderNumber}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 truncate">
                        {sub.items
                          .map((i) => `${i.productNameSnapshot} ×${i.quantity}`)
                          .join(' · ')}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                        <span>
                          السائق:{' '}
                          <span className="font-bold text-foreground">
                            {sub.assignedDriver?.name ?? '— لم يُعيّن بعد'}
                          </span>
                        </span>
                        {sub.assignedDriver?.phone && (
                          <span dir="ltr" className="text-foreground">
                            {sub.assignedDriver.phone}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-brand-red">
                        {total != null ? `${Number(total).toLocaleString('ar-EG')} ج.م` : '—'}
                      </div>
                      <div className="text-[10px] font-bold mt-1 inline-block px-1.5 py-0.5 rounded bg-brand-red/10 text-brand-red">
                        {ORDER_STATUS_AR[sub.status as OrderStatus] ?? sub.status}
                      </div>
                    </div>
                  </div>
                );
              },
            )}
          </div>
        </div>
      )}

      {/* ───────── Hero: order # + 4 phase quick-action cards ───────── */}
      <div className="bg-white rounded-xl border border-border p-5 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">رقم الطلب</div>
            <div className="font-mono text-xl font-black">{order.orderNumber}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {new Date(order.createdAt).toLocaleString('ar-EG')} ·{' '}
              {order.service?.nameAr ?? order.category}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">الإجمالي</div>
            <div className="font-black text-2xl text-brand-red">
              {hasPrice
                ? `${Number(order.finalPrice ?? order.quotedPrice).toLocaleString('ar-EG')} ج.م`
                : '— غير مسعّر'}
            </div>
          </div>
        </div>

        {/* 4-phase summary intentionally removed — the detailed timeline
            below ("مسار الحالة (للسجل)") is the single source of truth so
            admins aren't toggling between two competing progress UIs.
            Cancel + price + driver actions still live in their own cards. */}

        {canCancel && !isTerminal && (
          <div className="flex justify-end">
            <Button variant="danger" size="sm" onClick={() => setDialog({ kind: 'cancel' })}>
              <Ban className="w-4 h-4" /> إلغاء الطلب
            </Button>
          </div>
        )}

        {isTerminal && (
          <div
            className={`rounded-lg p-3 flex items-center gap-2 text-sm ${
              status === 'COMPLETED' ? 'bg-green-50 text-green-800' : 'bg-gray-100 text-gray-700'
            }`}
          >
            {status === 'COMPLETED' ? (
              <CheckCheck className="w-5 h-5" />
            ) : (
              <Ban className="w-5 h-5" />
            )}
            <span className="font-bold">{ORDER_STATUS_AR[status]}</span>
            {order.cancellationReason && (
              <span className="text-xs">— {order.cancellationReason}</span>
            )}
          </div>
        )}
      </div>

      {/* ───────── Next-action card (the "تحديث الطلب" button) ───────── */}
      {!isTerminal && (
        <NextActionCard
          status={status}
          hasPrice={hasPrice}
          pending={phasePending}
          onStage1={() => {
            if (hasPrice && (status === 'PRICED' || status === 'AWAITING_CUSTOMER_APPROVAL')) {
              advanceMut.mutate('ACCEPTED', {
                onSuccess: () => {
                  toast.success('تم قبول الطلب');
                  invalidate();
                },
              });
            } else {
              setDialog({ kind: 'price', after: 'ACCEPTED' });
            }
          }}
          onStage2={() => {
            if (status === 'DRIVER_ASSIGNED') {
              advanceMut.mutate('PICKED_UP', {
                onSuccess: () => {
                  toast.success('بدأ التوصيل');
                  invalidate();
                },
              });
            } else {
              setDialog({ kind: 'assign', after: 'PICKED_UP' });
            }
          }}
          onStage3={() => markDeliveredMut.mutate(status)}
          onStage4={() =>
            advanceMut.mutate('COMPLETED', {
              onSuccess: () => {
                toast.success('تم إنهاء الطلب');
                invalidate();
              },
            })
          }
        />
      )}

      {/* ───────── Status stepper (4 major stages) ───────── */}
      <div className="bg-white rounded-xl border border-border p-5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-3 flex items-center gap-1.5">
          <FileSearch className="w-4 h-4" />
          مراحل الطلب
        </div>
        <WorkflowStepper currentStatus={status} terminalKind={isTerminal ? status : null} />
      </div>

      {/* ───────── Main 2-col grid ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card title="العميل" icon={<User className="w-4 h-4" />}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-red/10 grid place-items-center font-black text-brand-red">
                {order.customer?.name?.charAt(0) ?? '؟'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{order.customer?.name ?? '—'}</div>
                <a
                  href={`tel:${order.customer?.phone}`}
                  className="text-sm text-brand-red"
                  dir="ltr"
                >
                  {order.customer?.phone}
                </a>
              </div>
              {order.customer?.phone && (
                <a
                  href={`https://wa.me/${order.customer.phone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded-full font-bold inline-flex items-center gap-1"
                >
                  <MessageSquare className="w-3 h-3" /> واتساب
                </a>
              )}
            </div>
            {order.customer?.city && (
              <div className="text-xs text-muted-foreground mt-2">{order.customer.city}</div>
            )}
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {order.pickupAddress && (
              <Card title="عنوان الاستلام" icon={<MapPin className="w-4 h-4 text-green-600" />}>
                <div className="text-sm">{order.pickupAddress}</div>
                {order.pickupLat && order.pickupLng && (
                  <a
                    href={`https://maps.google.com/?q=${order.pickupLat},${order.pickupLng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-brand-red underline mt-1 inline-block"
                  >
                    فتح على الخريطة
                  </a>
                )}
              </Card>
            )}
            {order.deliveryAddress && (
              <Card title="عنوان التوصيل" icon={<MapPin className="w-4 h-4 text-brand-red" />}>
                <div className="text-sm">{order.deliveryAddress}</div>
                {order.deliveryLat && order.deliveryLng && (
                  <a
                    href={`https://maps.google.com/?q=${order.deliveryLat},${order.deliveryLng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-brand-red underline mt-1 inline-block"
                  >
                    فتح على الخريطة
                  </a>
                )}
              </Card>
            )}
          </div>

          {(order.notes || customData?.quickOrder) && (
            <Card title="تفاصيل الطلب" icon={<MessageSquare className="w-4 h-4" />}>
              <div className="whitespace-pre-wrap text-sm">{(order.notes as string) || '—'}</div>
              {Boolean(customData?.quickOrder) && (
                <div className="mt-2 inline-flex items-center gap-1 bg-yellow-50 text-yellow-800 px-2 py-1 rounded text-xs font-bold">
                  <Clock className="w-3 h-3" /> طلب سريع · {String(customData?.mode ?? 'menu')}
                </div>
              )}
            </Card>
          )}

          {imageUrls.length > 0 && (
            <Card
              title={`الصور المرفقة (${imageUrls.length})`}
              icon={<ImageIcon className="w-4 h-4" />}
            >
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {imageUrls.map((u, i) => (
                  <a
                    key={i}
                    href={u}
                    target="_blank"
                    rel="noreferrer"
                    className="block aspect-square rounded-lg overflow-hidden bg-muted"
                  >
                    <img
                      src={u}
                      alt={`مرفق ${i + 1}`}
                      className="w-full h-full object-cover hover:scale-105 transition"
                    />
                  </a>
                ))}
              </div>
            </Card>
          )}

          {audioUri && (
            <Card title="تسجيل صوتي" icon={<Mic className="w-4 h-4" />}>
              <audio src={audioUri} controls className="w-full" />
              {typeof customData?.audioDurationMs === 'number' && (
                <div className="text-xs text-muted-foreground mt-1">
                  المدة: {Math.round((customData.audioDurationMs as number) / 1000)} ثانية
                </div>
              )}
            </Card>
          )}

          {Array.isArray(order.items) && order.items.length > 0 && (
            <ItemsByMerchantCard items={order.items} />
          )}

          {order.review && <ReviewCard review={order.review} />}

          {customData &&
            Object.entries(customData).filter(([k]) => !renderedKeys.has(k)).length > 0 && (
              <Card title="بيانات إضافية" icon={<Phone className="w-4 h-4" />}>
                <CustomDataRender
                  data={Object.fromEntries(
                    Object.entries(customData).filter(([k]) => !renderedKeys.has(k)),
                  )}
                />
              </Card>
            )}
        </div>

        {/* ───────── Right sidebar: pricing summary + driver + side actions + history ───────── */}
        <div className="space-y-4">
          {/* Pricing summary — prominent because it's the conversion bottleneck */}
          <Card title="التسعير" icon={<DollarSign className="w-4 h-4" />}>
            {hasPrice ? (
              <div className="space-y-2">
                {order.quotedPrice != null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">السعر المعروض</span>
                    <span className="font-bold">
                      {Number(order.quotedPrice).toLocaleString('ar-EG')} ج.م
                    </span>
                  </div>
                )}
                {order.finalPrice != null && (
                  <div className="flex justify-between text-sm pt-2 border-t border-border">
                    <span className="text-muted-foreground">السعر النهائي</span>
                    <span className="font-black text-brand-red">
                      {Number(order.finalPrice).toLocaleString('ar-EG')} ج.م
                    </span>
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                  onClick={() => setDialog({ kind: 'price' })}
                >
                  <Edit3 className="w-3 h-3" /> تعديل السعر
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-amber-700 bg-amber-50 rounded p-2 inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> الطلب لسه مش مسعّر
                </p>
                <Button size="sm" className="w-full" onClick={() => setDialog({ kind: 'price' })}>
                  <DollarSign className="w-4 h-4" /> تسعير الطلب
                </Button>
              </div>
            )}
          </Card>

          {/* Driver */}
          <Card title="السائق" icon={<User className="w-4 h-4" />}>
            {order.assignedDriver ? (
              <div className="space-y-2">
                <div className="font-bold">{order.assignedDriver.name}</div>
                <a
                  href={`tel:${order.assignedDriver.phone}`}
                  className="text-sm text-brand-red block"
                  dir="ltr"
                >
                  {order.assignedDriver.phone}
                </a>
                {order.assignedDriver.driverProfile && (
                  <Badge>
                    {order.assignedDriver.driverProfile.vehicleType}{' '}
                    {order.assignedDriver.driverProfile.vehiclePlate}
                  </Badge>
                )}
                {!isTerminal && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    onClick={() => setDialog({ kind: 'assign' })}
                  >
                    <Edit3 className="w-3 h-3" /> تغيير السائق
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">لم يتم تعيين سائق بعد</p>
                {!isTerminal && (
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => setDialog({ kind: 'assign' })}
                  >
                    <Truck className="w-4 h-4" /> تعيين سائق
                  </Button>
                )}
              </div>
            )}
          </Card>

          {/* Supervisor on-shift dispatch — populated automatically when
              the order entered NEW status. Read-only audit card so the
              admin can see who got pinged on WhatsApp. */}
          <Card title="المشرف المُخطَر" icon={<UserCheck className="w-4 h-4" />}>
            {Array.isArray(order.supervisorDispatches) && order.supervisorDispatches.length > 0 ? (
              (() => {
                const latest = order.supervisorDispatches[0];
                const ok = latest.status === 'SENT';
                const ts = new Date(latest.sentAt).toLocaleString('ar-EG', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                });
                return (
                  <div className="space-y-2">
                    <div className="font-bold">{latest.supervisor?.name ?? '— تم حذف المشرف'}</div>
                    {latest.supervisor?.whatsappPhone && (
                      <a
                        href={`https://wa.me/${latest.supervisor.whatsappPhone.replace(/[^\d]/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-brand-red block"
                        dir="ltr"
                      >
                        {latest.supervisor.whatsappPhone}
                      </a>
                    )}
                    <div
                      className={`text-xs inline-flex items-center gap-1 px-2 py-0.5 rounded ${
                        ok ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {ok ? '✓ تم إرسال الواتساب' : '⚠ فشل الإرسال'} · {ts}
                    </div>
                    {!ok && latest.errorMessage && (
                      <div className="text-xs text-muted-foreground">{latest.errorMessage}</div>
                    )}
                    {order.supervisorDispatches.length > 1 && (
                      <div className="text-xs text-muted-foreground pt-1 border-t">
                        + {order.supervisorDispatches.length - 1} محاولة إرسال سابقة
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <p className="text-sm text-muted-foreground">
                لم يتم إخطار مشرف — لا يوجد مشرف على الشيفت لحظة استلام الطلب.
              </p>
            )}
          </Card>

          {/* Side actions */}
          <Card title="إجراءات" icon={<MessageSquare className="w-4 h-4" />}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialog({ kind: 'note' })}
              className="w-full"
            >
              <MessageSquare className="w-3 h-3" /> ملاحظة داخلية
            </Button>
          </Card>

          {/* Audit history */}
          {Array.isArray(order.statusHistory) && order.statusHistory.length > 0 && (
            <Card title="السجل">
              <ol className="space-y-3">
                {order.statusHistory.map((h: Order) => (
                  <li key={h.id} className="border-r-2 border-brand-red pe-3 text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      {h.fromStatus && h.fromStatus !== h.toStatus ? (
                        <>
                          <StatusBadge status={h.fromStatus} />
                          <ChevronRight className="w-3 h-3 text-muted-foreground" />
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
            </Card>
          )}
        </div>
      </div>

      {/* Action dialogs. The `after` field on dialog state lets the NextActionCard
          chain a status-advance onto the dialog's success — e.g. tasering the
          price dialog with after='ACCEPTED' auto-promotes the order to
          ACCEPTED once the admin saves the price. */}
      {dialog?.kind === 'price' && (
        <PriceDialog
          orderId={id!}
          initialPrice={order.quotedPrice ?? order.finalPrice}
          initialGoods={order.merchantSubtotal}
          initialFee={order.deliveryFee}
          initialItems={order.items}
          currentStatus={status}
          onSaved={() => {
            const next = dialog.after;
            if (next) {
              advanceMut.mutate(next, {
                onSuccess: () => {
                  toast.success('تم قبول الطلب');
                },
              });
            }
          }}
          onClose={() => {
            setDialog(null);
            invalidate();
          }}
        />
      )}
      {dialog?.kind === 'assign' && (
        <AssignDialog
          orderId={id!}
          onAssigned={() => {
            const next = dialog.after;
            if (next) {
              advanceMut.mutate(next, {
                onSuccess: () => {
                  toast.success('بدأ التوصيل');
                },
              });
            }
          }}
          onClose={() => {
            setDialog(null);
            invalidate();
          }}
        />
      )}
      {dialog?.kind === 'cancel' && (
        <CancelDialog
          orderId={id!}
          onClose={() => {
            setDialog(null);
            invalidate();
          }}
        />
      )}
      {dialog?.kind === 'note' && (
        <NoteDialog
          orderId={id!}
          onClose={() => {
            setDialog(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Next-action card — one prominent button per major stage. The 12-state FSM
// collapses into 4 admin actions matching the 4 stepper stages:
//   1. استلام     → تسعير وقبول الطلب  (opens price dialog → auto-advance to ACCEPTED)
//   2. مؤكد       → تعيين سائق وبدء التوصيل (opens assign dialog → auto-advance to PICKED_UP)
//   3. متجه       → تأكيد التسليم للعميل (walks PICKED_UP → IN_ROUTE → DELIVERED)
//   4. تم         → إنهاء الطلب (advances DELIVERED → COMPLETED)
// ────────────────────────────────────────────────────────────────────────────

interface StageActionUI {
  stage: 1 | 2 | 3 | 4;
  label: string;
  hint: string;
  onClick: () => void;
}

function NextActionCard({
  status,
  hasPrice,
  pending,
  onStage1,
  onStage2,
  onStage3,
  onStage4,
}: {
  status: OrderStatus;
  hasPrice: boolean;
  pending: boolean;
  onStage1: () => void;
  onStage2: () => void;
  onStage3: () => void;
  onStage4: () => void;
}) {
  const action: StageActionUI | null = (() => {
    const idx = majorStageIndexFor(status);
    switch (idx) {
      case 0:
        return {
          stage: 1,
          label: hasPrice ? 'قبول الطلب' : 'تسعير وقبول الطلب',
          hint: hasPrice
            ? 'تأكيد قبول الطلب والانتقال لمرحلة التعيين'
            : 'حدّد السعر، احفظه، والطلب يتقبل تلقائياً',
          onClick: onStage1,
        };
      case 1:
        return {
          stage: 2,
          label: status === 'DRIVER_ASSIGNED' ? 'بدء التوصيل' : 'تعيين سائق وبدء التوصيل',
          hint:
            status === 'DRIVER_ASSIGNED'
              ? 'السائق استلم الطلب من المتجر'
              : 'اختر سائقاً متاحاً، والطلب يتحول لـ "في الطريق" تلقائياً',
          onClick: onStage2,
        };
      case 2:
        return {
          stage: 3,
          label: 'تأكيد التسليم للعميل',
          hint: 'العميل استلم الطلب من السائق',
          onClick: onStage3,
        };
      case 3:
        return {
          stage: 4,
          label: 'إنهاء الطلب',
          hint: 'إغلاق الطلب وتسجيله كمكتمل في السجل',
          onClick: onStage4,
        };
      default:
        return null;
    }
  })();

  if (!action) return null;

  return (
    <div
      className="rounded-xl border-2 p-5 flex items-center gap-4 shadow-sm"
      style={{
        background: 'linear-gradient(135deg, rgba(224,48,30,0.06), rgba(242,169,59,0.08))',
        borderColor: 'rgba(224,48,30,0.25)',
      }}
    >
      <div className="w-14 h-14 rounded-xl bg-brand-red text-white grid place-items-center shrink-0 shadow-md">
        {pending ? (
          <Loader2 className="w-6 h-6 animate-spin" />
        ) : (
          <ChevronRight className="w-7 h-7" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-xs text-brand-red font-bold uppercase tracking-wider mb-0.5">
          الإجراء التالي · المرحلة {action.stage} من 4
        </div>
        <div className="font-black text-lg leading-tight">{action.label}</div>
        <div className="text-sm text-muted-foreground mt-0.5">{action.hint}</div>
      </div>

      <Button onClick={action.onClick} disabled={pending} size="lg" className="shrink-0">
        {action.label}
      </Button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Workflow stepper — horizontal beaded line, one node per stage
// ────────────────────────────────────────────────────────────────────────────

function WorkflowStepper({
  currentStatus,
  terminalKind,
}: {
  currentStatus: OrderStatus;
  terminalKind: OrderStatus | null;
}) {
  // COMPLETED is past the last stage — render everything as done.
  // CANCELLED / REJECTED collapse to -1 → all stages render greyed.
  const rawIdx = majorStageIndexFor(currentStatus);
  const currentIdx = currentStatus === 'COMPLETED' ? MAJOR_STAGES.length : rawIdx;

  return (
    <div className="flex items-center justify-between gap-1 overflow-x-auto pb-2 px-2">
      {MAJOR_STAGES.map((stage, i) => {
        const isDone = i < currentIdx;
        const isCurrent = i === currentIdx && !terminalKind;
        const isFuture = i > currentIdx;
        const isFailed = terminalKind === 'CANCELLED' || terminalKind === 'REJECTED';

        const dotStyle = isFailed
          ? 'bg-gray-200 text-gray-400'
          : isDone
            ? 'bg-green-500 text-white'
            : isCurrent
              ? 'bg-brand-red text-white ring-4 ring-brand-red/20 animate-pulse'
              : 'bg-muted text-muted-foreground';

        const lineStyle = isDone ? 'bg-green-400' : 'bg-muted';

        return (
          <div key={i} className="flex items-center flex-1 last:flex-none min-w-0">
            <div className="flex flex-col items-center gap-1.5 min-w-[80px]">
              <div
                className={`w-12 h-12 rounded-full grid place-items-center transition ${dotStyle}`}
                title={stage.label}
              >
                {isDone ? <Check className="w-5 h-5" /> : <stage.Icon className="w-5 h-5" />}
              </div>
              <div
                className={`text-xs text-center leading-tight font-bold ${
                  isCurrent ? 'text-brand-red' : isDone ? 'text-green-700' : 'text-muted-foreground'
                } ${isFuture ? 'opacity-60' : ''}`}
              >
                {stage.short}
              </div>
            </div>
            {i < MAJOR_STAGES.length - 1 && (
              <div className={`h-1.5 flex-1 rounded-full mx-2 mt-[-22px] ${lineStyle}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Phase card — one of the 4 big quick-action buttons at the top.
// Only the "current" phase is clickable; the others show their state but
// can't be tapped (already done / not yet reachable).
// ────────────────────────────────────────────────────────────────────────────

type PhaseCardState = 'current' | 'done' | 'locked';

// Retained for potential future revival of the 4-card overview — currently
// unused since the detailed status timeline is the sole progress UI.
function PhaseCard({
  phase,
  state,
  pending,
  onClick,
}: {
  phase: Phase;
  state: PhaseCardState;
  pending: boolean;
  onClick: () => void;
}) {
  const isCurrent = state === 'current';
  const isDone = state === 'done';

  const toneClass = isCurrent ? phase.tone.current : isDone ? phase.tone.done : phase.tone.base;
  const disabled = !isCurrent || pending;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={isCurrent ? 'step' : undefined}
      className={`relative text-right rounded-xl border p-4 transition flex flex-col gap-2 min-h-[110px] ${toneClass} ${
        isCurrent ? 'hover:scale-[1.01] cursor-pointer shadow-sm' : 'cursor-not-allowed opacity-80'
      } disabled:opacity-60`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold opacity-70">المرحلة {phase.id}</span>
        {isDone && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold">
            <Check className="w-3.5 h-3.5" /> مكتملة
          </span>
        )}
        {isCurrent && !pending && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold">
            <Clock className="w-3.5 h-3.5 animate-pulse" /> الآن
          </span>
        )}
        {pending && <Loader2 className="w-4 h-4 animate-spin" />}
      </div>
      <div className="flex items-center gap-2">
        <phase.Icon className="w-6 h-6 shrink-0" />
        <span className="text-sm font-black leading-tight">{phase.label}</span>
      </div>
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers + dialogs
// ────────────────────────────────────────────────────────────────────────────

function BackBar({ onBack }: { onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronRight className="w-4 h-4" />
      العودة لقائمة الطلبات
    </button>
  );
}

/** Renders five star icons filled up to `rating` (0..5). */
function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} من 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          style={{ fontSize: size, lineHeight: 1, color: i <= rating ? '#F2A93B' : '#D1D5DB' }}
        >
          ★
        </span>
      ))}
    </span>
  );
}

/**
 * The customer's review of this order. Always shows the overall rating;
 * driver/merchant breakdowns and the free-text comment appear only when
 * the customer filled them in.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ReviewCard({ review }: { review: any }) {
  const overall = Number(review.rating) || 0;
  const driverR = review.driverRating != null ? Number(review.driverRating) : null;
  const merchantR = review.merchantRating != null ? Number(review.merchantRating) : null;
  return (
    <Card title="تقييم العميل" icon={<CheckCircle2 className="w-4 h-4" />}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold">التقييم العام</span>
          <div className="flex items-center gap-2">
            <Stars rating={overall} size={18} />
            <span className="font-black text-brand-red">{overall}/5</span>
          </div>
        </div>
        {(driverR != null || merchantR != null) && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            {driverR != null && (
              <div className="bg-muted/30 rounded-lg p-2">
                <div className="text-xs text-muted-foreground">السائق</div>
                <div className="flex items-center gap-1 mt-1">
                  <Stars rating={driverR} />
                  <span className="font-bold">{driverR}/5</span>
                </div>
              </div>
            )}
            {merchantR != null && (
              <div className="bg-muted/30 rounded-lg p-2">
                <div className="text-xs text-muted-foreground">التاجر</div>
                <div className="flex items-center gap-1 mt-1">
                  <Stars rating={merchantR} />
                  <span className="font-bold">{merchantR}/5</span>
                </div>
              </div>
            )}
          </div>
        )}
        {review.comment && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm leading-relaxed">
            <span className="text-muted-foreground text-xs block mb-1">التعليق</span>
            <span className="italic">"{review.comment}"</span>
          </div>
        )}
        {review.createdAt && (
          <div className="text-xs text-muted-foreground text-end">
            {new Date(review.createdAt).toLocaleString('ar-EG')}
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * Renders order items grouped by merchant. For a single-merchant order it
 * looks like a regular product list with one header; for a merged
 * multi-merchant cart it shows each store in its own section with its
 * logo / name / subtotal — which is exactly what makes "سلة متعددة المتاجر"
 * easy to scan as ONE order instead of three.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
/**
 * Extras chosen at order time. Normally an array (the API decodes the JSON
 * column), but accept a string too — one of the two order routes doesn't run
 * rows through the JSON decoder, and rendering "[object Object]" to a
 * dispatcher who has to go buy the thing is the worst possible failure.
 */
function extrasLabel(raw: unknown): string | null {
  let list = raw;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(list) || list.length === 0) return null;
  const names = list
    .map((a) => String((a as { nameAr?: unknown })?.nameAr ?? '').trim())
    .filter(Boolean);
  return names.length > 0 ? names.join('، ') : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ItemsByMerchantCard({ items }: { items: any[] }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups = new Map<string, { merchant: any; items: any[]; subtotal: number }>();
  for (const it of items) {
    const key = it.merchantId ?? '__nomerchant__';
    let g = groups.get(key);
    if (!g) {
      g = { merchant: it.merchant ?? null, items: [], subtotal: 0 };
      groups.set(key, g);
    }
    g.items.push(it);
    g.subtotal += Number(it.unitPriceSnapshot ?? 0) * it.quantity;
  }
  const groupArr = Array.from(groups.values());
  const isMulti = groupArr.length > 1;

  // Single-merchant orders are the common case, and the header used to read
  // just "المنتجات (3)" — the store never appeared anywhere, so an admin
  // couldn't tell where to buy from without opening the order's merchant tab.
  const soleMerchant = !isMulti ? (groupArr[0]?.merchant?.storeNameAr ?? null) : null;

  return (
    <Card
      title={
        isMulti
          ? `🛒 المنتجات — من ${groupArr.length} متاجر (${items.length})`
          : soleMerchant
            ? `🏪 ${soleMerchant} — المنتجات (${items.length})`
            : `المنتجات (${items.length})`
      }
      icon={<MessageSquare className="w-4 h-4" />}
    >
      <div className="space-y-3">
        {groupArr.map((g, gi) => (
          <div key={gi} className={isMulti ? 'border border-border rounded-lg' : ''}>
            {isMulti && (
              <div className="px-3 py-2 bg-brand-red/5 border-b border-border flex items-center gap-2">
                {g.merchant?.logoUrl ? (
                  <img
                    src={g.merchant.logoUrl}
                    alt={g.merchant.storeNameAr}
                    className="w-7 h-7 rounded object-cover"
                  />
                ) : (
                  <div className="w-7 h-7 rounded bg-brand-orange/10 text-brand-orange flex items-center justify-center font-bold text-xs">
                    {g.merchant?.storeNameAr?.[0] ?? '?'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">
                    {g.merchant?.storeNameAr ?? '— تاجر غير معروف —'}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{g.items.length} منتج</div>
                </div>
                <div className="text-sm font-bold text-brand-red">
                  {g.subtotal.toLocaleString('ar-EG')} ج.م
                </div>
              </div>
            )}
            <ul className={`divide-y divide-border ${isMulti ? 'px-3' : ''}`}>
              {g.items.map((it, i) => {
                const extras = extrasLabel(it.addonsSnapshot);
                return (
                  <li key={i} className="py-2 flex items-start justify-between gap-2 text-sm">
                    <span className="min-w-0">
                      <span className="font-bold">{it.quantity}×</span> {it.productNameSnapshot}
                      {/* The size is part of what to buy, not a label — a
                          dispatcher handed "بيتزا فراخ" alone buys the wrong
                          one. */}
                      {it.variantNameSnapshot && (
                        <span className="font-bold text-brand-red">
                          {' '}
                          — {it.variantNameSnapshot}
                        </span>
                      )}
                      {extras && (
                        <span className="block text-xs text-muted-foreground">+ {extras}</span>
                      )}
                    </span>
                    {it.unitPriceSnapshot && (
                      <span className="text-muted-foreground whitespace-nowrap">
                        {(Number(it.unitPriceSnapshot) * it.quantity).toLocaleString('ar-EG')} ج.م
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-border p-4 space-y-2">
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-1.5">
        {icon}
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

// Arabic labels for the keys we know about. Anything else falls back to
// the raw key (better than hiding it — admins occasionally add new fields).
const CUSTOM_DATA_LABELS: Record<string, string> = {
  order_text: 'وصف الطلب',
  details: 'وصف الطلب',
  description: 'الوصف',
  notes: 'ملاحظات',
  weight: 'الوزن',
  size: 'الحجم',
  fragile: 'هش / قابل للكسر',
  attachment: 'مرفقات',
  attachments: 'مرفقات',
  images: 'صور',
};

function isLikelyImageUrl(s: string): boolean {
  return /^https?:\/\//.test(s) && /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(s);
}

function CustomDataRender({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) {
    return <div className="text-xs text-muted-foreground">لا توجد بيانات إضافية</div>;
  }
  return (
    <div className="space-y-3">
      {entries.map(([key, value]) => {
        const label = CUSTOM_DATA_LABELS[key] ?? key;

        // Array of image URLs → image grid
        if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
          const arr = value as string[];
          if (arr.length === 0) return null;
          const allImages = arr.every(isLikelyImageUrl);
          if (allImages) {
            return (
              <div key={key}>
                <div className="text-xs font-bold text-muted-foreground mb-1">{label}</div>
                <div className="flex flex-wrap gap-2">
                  {arr.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block border border-border rounded-lg overflow-hidden hover:border-brand-red"
                    >
                      <img src={url} alt="" className="w-20 h-20 object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            );
          }
          // Generic string array → chips
          return (
            <div key={key}>
              <div className="text-xs font-bold text-muted-foreground mb-1">{label}</div>
              <div className="flex flex-wrap gap-1">
                {arr.map((v, i) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-muted text-xs">
                    {v}
                  </span>
                ))}
              </div>
            </div>
          );
        }

        // Empty array — show "—" instead of "[]"
        if (Array.isArray(value) && value.length === 0) {
          return (
            <div key={key} className="flex items-baseline gap-2">
              <span className="text-xs font-bold text-muted-foreground shrink-0">{label}:</span>
              <span className="text-xs text-muted-foreground">—</span>
            </div>
          );
        }

        // Single image URL
        if (typeof value === 'string' && isLikelyImageUrl(value)) {
          return (
            <div key={key}>
              <div className="text-xs font-bold text-muted-foreground mb-1">{label}</div>
              <a href={value} target="_blank" rel="noopener noreferrer">
                <img
                  src={value}
                  alt={label}
                  className="w-32 h-32 object-cover rounded-lg border border-border hover:border-brand-red"
                />
              </a>
            </div>
          );
        }

        // Long free-text — render as a quoted block so it stays readable
        if (typeof value === 'string' && value.length > 60) {
          return (
            <div key={key}>
              <div className="text-xs font-bold text-muted-foreground mb-1">{label}</div>
              <div className="text-sm whitespace-pre-wrap bg-muted/40 rounded p-2">{value}</div>
            </div>
          );
        }

        // Booleans
        if (typeof value === 'boolean') {
          return (
            <div key={key} className="flex items-baseline gap-2">
              <span className="text-xs font-bold text-muted-foreground shrink-0">{label}:</span>
              <span className="text-sm">{value ? 'نعم' : 'لا'}</span>
            </div>
          );
        }

        // Numbers / short strings — inline label : value
        const display =
          typeof value === 'string' || typeof value === 'number'
            ? String(value)
            : JSON.stringify(value);
        return (
          <div key={key} className="flex items-baseline gap-2">
            <span className="text-xs font-bold text-muted-foreground shrink-0">{label}:</span>
            <span className="text-sm">{display}</span>
          </div>
        );
      })}
    </div>
  );
}

/** One "bought from this store, for this much" line. */
interface MerchantLine {
  key: string;
  merchantId: string;
  amount: string;
}

let lineSeq = 0;
const newLine = (merchantId = '', amount = ''): MerchantLine => ({
  key: `l${++lineSeq}`,
  merchantId,
  amount,
});

function PriceDialog({
  orderId,
  initialPrice,
  initialGoods,
  initialFee,
  initialItems,
  currentStatus,
  onSaved,
  onClose,
}: {
  orderId: string;
  initialPrice?: number | string | null;
  /** Goods value and delivery fee are priced separately — the total alone can't
   *  be un-mixed later, and every merchant payout / commission figure in the
   *  reports is derived from this split. */
  initialGoods?: number | string | null;
  initialFee?: number | string | null;
  /** Existing breakdown lines, so re-pricing edits the split instead of
   *  starting from a blank one. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialItems?: any[];
  /** When provided and the order is NEW, we promote it to UNDER_REVIEW first
   *  so the backend's set-price endpoint can then auto-transition to PRICED.
   *  This is what makes the "بدء المراجعة + تسعير" button a single click. */
  currentStatus?: OrderStatus;
  /** Called after the price is saved successfully but before the dialog
   *  closes — used to chain a status advance (e.g. PRICED → ACCEPTED). */
  onSaved?: () => void;
  onClose: () => void;
}) {
  const { data: merchants } = useQuery({
    queryKey: ['admin', 'merchants', 'picker'],
    queryFn: () => api.adminListMerchants({ pageSize: 100 }),
    staleTime: 300_000,
    refetchInterval: false,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merchantList: any[] = (merchants?.items as any[]) ?? [];

  // Seed from whatever the order already recorded. A single-merchant order
  // priced before this existed has no lines, so it starts with one blank row
  // the admin has to fill — which is the whole point.
  const [lines, setLines] = useState<MerchantLine[]>(() => {
    /*
     * One row PER MERCHANT, not per item.
     *
     * This used to map over items directly, so three products from the same
     * restaurant seeded three identical rows — which the duplicate-merchant
     * check below then rejected, blocking the save on an order the admin had
     * done nothing wrong with. Sum the line totals per merchant instead.
     */
    const totals = new Map<string, number>();
    for (const it of initialItems ?? []) {
      if (!it?.merchantId) continue;
      const id = String(it.merchantId);
      const lineTotal = Number(it.unitPriceSnapshot ?? 0) * (it.quantity ?? 1);
      totals.set(id, (totals.get(id) ?? 0) + lineTotal);
    }

    const seeded = Array.from(totals.entries()).map(([id, total]) =>
      // Rounded to piastres: summing decimals accumulates float error, and the
      // field is money.
      newLine(id, String(Math.round(total * 100) / 100)),
    );
    return seeded.length ? seeded : [newLine()];
  });
  const [fee, setFee] = useState(initialFee != null ? String(initialFee) : '');
  const [note, setNote] = useState('');

  // Goods is the sum of the split, never typed separately: two numbers that
  // must agree shouldn't be entered twice.
  const goods = lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  const price = goods + (Number(fee) || 0);

  const patchLine = (key: string, p: Partial<MerchantLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const usedIds = new Set(lines.map((l) => l.merchantId).filter(Boolean));
  const duplicate = usedIds.size !== lines.filter((l) => l.merchantId).length;
  const incomplete = lines.some((l) => !l.merchantId || !(Number(l.amount) > 0));
  const invalid = incomplete || duplicate || fee === '' || price <= 0;

  const mut = useMutation({
    mutationFn: async () => {
      // Phase-1 entry: if we're still on NEW, walk through UNDER_REVIEW first.
      // The set-price endpoint then auto-transitions UNDER_REVIEW → PRICED.
      if (currentStatus === 'NEW') {
        await api.adminUpdateOrderStatus(orderId, 'UNDER_REVIEW');
      }
      return api.adminSetPrice(
        orderId,
        price,
        {
          merchantSubtotal: goods,
          deliveryFee: Number(fee) || 0,
          merchants: lines.map((l) => ({
            merchantId: l.merchantId,
            amount: Number(l.amount) || 0,
          })),
        },
        note.trim() || undefined,
      );
    },
    onSuccess: () => {
      toast.success('تم حفظ السعر');
      onSaved?.();
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="تسعير الطلب" size="lg">
      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-bold">
              اتشرى من <span className="text-destructive">*</span>
            </span>
            <button
              type="button"
              onClick={() => setLines((ls) => [...ls, newLine()])}
              className="text-xs font-bold text-brand-red hover:underline inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              إضافة تاجر
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-2 leading-5">
            حدّد كل تاجر اتشرى منه وقيمة اللي اتشرى — عشان الإيراد يتسجّل له في التقارير.
          </p>

          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={l.key} className="flex items-center gap-2">
                <select
                  value={l.merchantId}
                  onChange={(e) => patchLine(l.key, { merchantId: e.target.value })}
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-input bg-white text-sm"
                >
                  <option value="">— اختر التاجر —</option>
                  {merchantList.map((m) => (
                    <option
                      key={m.id}
                      value={m.id}
                      // Can't credit the same store twice in one order; the
                      // amounts would just need adding together anyway.
                      disabled={usedIds.has(String(m.id)) && l.merchantId !== String(m.id)}
                    >
                      {m.storeNameAr}
                    </option>
                  ))}
                </select>
                <div className="relative w-32 shrink-0">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={l.amount}
                    onChange={(e) => patchLine(l.key, { amount: e.target.value })}
                    placeholder="0"
                    autoFocus={i === 0}
                  />
                </div>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    aria-label="حذف السطر"
                    className="p-2 rounded-md hover:bg-destructive/10 text-destructive shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {duplicate && (
            <p className="text-xs text-destructive mt-1.5">
              تاجر مكرر — ادمج القيمتين في سطر واحد.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/40 px-3 py-2">
            <div className="text-xs text-muted-foreground">قيمة البضاعة</div>
            <div className="text-base font-bold tabular-nums">
              {goods.toLocaleString('ar-EG')} ج.م
              {lines.length > 1 && (
                <span className="text-xs font-normal text-muted-foreground">
                  {' '}
                  ({lines.length} تجار)
                </span>
              )}
            </div>
          </div>
          <Field label="رسوم التوصيل" required>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              value={fee}
              onChange={(e) => setFee(e.target.value)}
            />
          </Field>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-brand-red/5 border border-brand-red/20 px-3 py-2">
          <span className="text-sm font-bold">الإجمالي على العميل</span>
          <span className="text-lg font-black tabular-nums">
            {price.toLocaleString('ar-EG')} ج.م
          </span>
        </div>

        {/* Shown, never auto-split: back-solving goods = total − fee would just
            re-record a guess as fact. The admin who knows the real breakdown
            enters it; the old total is only here as their anchor. */}
        {initialPrice != null && initialGoods == null && (
          <p className="text-xs text-muted-foreground">
            السعر المسجّل سابقاً: {Number(initialPrice).toLocaleString('ar-EG')} ج.م — من فضلك وزّعه
            على التجار والتوصيل.
          </p>
        )}

        <Field label="ملاحظات (اختياري)">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="مثلاً: السعر يشمل التغليف..."
          />
        </Field>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>
          إلغاء
        </Button>
        <Button
          onClick={() => mut.mutate()}
          disabled={invalid || mut.isPending}
          title={incomplete ? 'حدّد التاجر وقيمة كل سطر أولاً' : undefined}
        >
          {mut.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          حفظ السعر
        </Button>
      </div>
    </Dialog>
  );
}

function AssignDialog({
  orderId,
  onAssigned,
  onClose,
}: {
  orderId: string;
  /** Called after the driver is assigned successfully but before the dialog
   *  closes — used to chain a status advance (e.g. DRIVER_ASSIGNED → PICKED_UP). */
  onAssigned?: () => void;
  onClose: () => void;
}) {
  const { data: drivers, isLoading } = useQuery({
    queryKey: ['admin', 'drivers', 'available'],
    queryFn: () => api.adminListDrivers({ status: 'AVAILABLE', pageSize: 50 }),
  });
  const [driverId, setDriverId] = useState('');
  const mut = useMutation({
    mutationFn: () => api.adminAssignDriver(orderId, driverId),
    onSuccess: () => {
      toast.success('تم تعيين السائق');
      onAssigned?.();
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const items = (drivers?.items as Order[] | undefined) ?? [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="تعيين سائق">
      {isLoading ? (
        <div className="py-6 text-center text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" />
          جاري تحميل السائقين المتاحين...
        </div>
      ) : items.length === 0 ? (
        <p className="bg-amber-50 text-amber-800 rounded-lg p-3 text-sm inline-flex items-center gap-1.5">
          <Clock className="w-4 h-4 shrink-0" />
          مفيش سائقين متاحين دلوقتي. خلي السائق يفعّل حالته من تطبيق الكابتن.
        </p>
      ) : (
        <Field label="السائق المتاح" required>
          <select
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-input bg-white text-sm"
          >
            <option value="">— اختر —</option>
            {items.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} — {d.driverProfile?.vehicleType ?? ''}{' '}
                {d.driverProfile?.vehiclePlate ?? ''}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>
          إلغاء
        </Button>
        <Button onClick={() => mut.mutate()} disabled={!driverId || mut.isPending}>
          {mut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
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
      <Field label="سبب الإلغاء" required>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          autoFocus
          placeholder="اكتب سبب الإلغاء..."
        />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>
          تراجع
        </Button>
        <Button
          variant="danger"
          onClick={() => mut.mutate()}
          disabled={reason.length < 2 || mut.isPending}
        >
          {mut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
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
    <Dialog open onOpenChange={(o) => !o && onClose()} title="ملاحظة داخلية">
      <Field label="الملاحظة" required>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} autoFocus />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>
          إلغاء
        </Button>
        <Button onClick={() => mut.mutate()} disabled={!note || mut.isPending}>
          إضافة
        </Button>
      </div>
    </Dialog>
  );
}

// Reserved for the legacy 4-card overview — paths that used to render it
// were removed (the detailed timeline below replaces it) but the helpers
// stay so future regressions don't need a wholesale rewrite. The void
// references keep tsc's noUnusedLocals happy without exporting symbols
// that aren't yet wired into any consumer.
void PhaseCard;
void PHASES;
void currentPhaseFor;
