import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
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
  HandCoins,
  ImageIcon,
  Loader2,
  MapPin,
  MessageSquare,
  Mic,
  Package,
  Phone,
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
// Workflow definition — the happy-path stages an order moves through. Each
// stage has an icon + a "next" rule that knows whether progressing to the
// next stage needs a dialog (price/driver) or is a one-tap status update.
// ────────────────────────────────────────────────────────────────────────────

interface Stage {
  status: OrderStatus;
  label: string;
  short: string;
  Icon: typeof Clock;
}

// Customer-approval step removed from the workflow — admin confirms with the
// customer outside the app (call/WhatsApp) then moves PRICED → ACCEPTED.
const HAPPY_PATH: Stage[] = [
  { status: 'NEW', label: 'استلام الطلب', short: 'استلام', Icon: ClipboardCheck },
  { status: 'UNDER_REVIEW', label: 'قيد المراجعة', short: 'مراجعة', Icon: FileSearch },
  { status: 'PRICED', label: 'تم التسعير', short: 'مسعّر', Icon: HandCoins },
  { status: 'ACCEPTED', label: 'تأكيد الطلب', short: 'مؤكد', Icon: CheckCircle2 },
  { status: 'DRIVER_ASSIGNED', label: 'تعيين سائق', short: 'سائق', Icon: UserCheck },
  { status: 'PICKED_UP', label: 'تم الاستلام', short: 'مستلم', Icon: Package },
  { status: 'IN_ROUTE', label: 'في الطريق', short: 'متجه', Icon: Truck },
  { status: 'DELIVERED', label: 'تم التوصيل', short: 'موصول', Icon: CheckCheck },
  { status: 'COMPLETED', label: 'مكتمل', short: 'تم', Icon: CheckCheck },
];

type NextActionKind = 'price' | 'assign' | 'advance' | 'wait-customer' | 'terminal';

interface NextAction {
  kind: NextActionKind;
  /** Status we'll transition to, if applicable. */
  target?: OrderStatus;
  /** Button label that explains what the admin is about to do. */
  label: string;
  hint?: string;
}

/**
 * Decide what the admin's "one-tap next" should do, given the current order.
 * This is the single source of truth for the big action button in the hero.
 *
 *   UNDER_REVIEW + no price  → open price dialog (skips a manual transition)
 *   PRICED                   → status → AWAITING_CUSTOMER_APPROVAL
 *   AWAITING_CUSTOMER_APPROVAL → "بانتظار العميل" (no admin action)
 *   ACCEPTED                 → open assign-driver dialog
 *   DRIVER_ASSIGNED/PICKED_UP/IN_ROUTE → status → next
 *   DELIVERED → status → COMPLETED
 *   terminal (COMPLETED/CANCELLED/REJECTED) → no action
 */
function nextActionFor(order: Order): NextAction {
  const status = order.status as OrderStatus;
  const hasPrice = order.quotedPrice != null || order.finalPrice != null;
  const hasDriver = !!order.assignedDriverId;

  if (status === 'NEW') {
    return { kind: 'advance', target: 'UNDER_REVIEW', label: 'ابدأ المراجعة' };
  }
  if (status === 'UNDER_REVIEW') {
    return hasPrice
      ? { kind: 'advance', target: 'PRICED', label: 'تأكيد التسعير' }
      : { kind: 'price', label: 'تسعير الطلب', hint: 'لازم تحدد السعر قبل ما تكمل' };
  }
  if (status === 'PRICED') {
    return {
      kind: 'advance',
      target: 'ACCEPTED',
      label: 'تأكيد موافقة العميل',
      hint: 'بعد ما تتواصل مع العميل وتأكد السعر',
    };
  }
  // Legacy orders may still be in this state from before we removed it.
  // We let admin move them forward to ACCEPTED directly.
  if (status === 'AWAITING_CUSTOMER_APPROVAL') {
    return {
      kind: 'advance',
      target: 'ACCEPTED',
      label: 'تأكيد موافقة العميل',
      hint: 'بعد ما تتواصل مع العميل وتأكد السعر',
    };
  }
  if (status === 'ACCEPTED') {
    return hasDriver
      ? { kind: 'advance', target: 'DRIVER_ASSIGNED', label: 'تأكيد تعيين السائق' }
      : { kind: 'assign', label: 'تعيين سائق', hint: 'اختر سائق متاح للطلب' };
  }
  if (status === 'DRIVER_ASSIGNED') {
    return {
      kind: 'advance',
      target: 'PICKED_UP',
      label: 'استلم السائق الطلب',
      hint: 'السائق لقي الطلب وحمله',
    };
  }
  if (status === 'PICKED_UP') {
    return { kind: 'advance', target: 'IN_ROUTE', label: 'السائق في الطريق' };
  }
  if (status === 'IN_ROUTE') {
    return { kind: 'advance', target: 'DELIVERED', label: 'تم تسليم الطلب' };
  }
  if (status === 'DELIVERED') {
    return { kind: 'advance', target: 'COMPLETED', label: 'إغلاق الطلب' };
  }
  return { kind: 'terminal', label: 'الطلب منتهي' };
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

  const [dialog, setDialog] = useState<null | 'price' | 'assign' | 'cancel' | 'note'>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
    qc.invalidateQueries({ queryKey: ['admin', 'order', id] });
  };

  // Direct status advance (no dialog) — used by the smart-next button when
  // we already have the prerequisites (price/driver) and just need to record
  // the transition.
  const advanceMut = useMutation({
    mutationFn: (status: OrderStatus) => api.adminUpdateOrderStatus(id!, status),
    onSuccess: (_d, status) => {
      toast.success(`تم الانتقال إلى: ${ORDER_STATUS_AR[status]}`);
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
  const next = nextActionFor(order);
  const isTerminal = status === 'COMPLETED' || status === 'CANCELLED' || status === 'REJECTED';
  const canCancel = (ORDER_TRANSITIONS[status] as readonly OrderStatus[]).includes('CANCELLED');
  const hasPrice = order.quotedPrice != null || order.finalPrice != null;
  const hasDriver = !!order.assignedDriverId;

  const fireNext = () => {
    if (next.kind === 'price') return setDialog('price');
    if (next.kind === 'assign') return setDialog('assign');
    if (next.kind === 'advance' && next.target) return advanceMut.mutate(next.target);
  };

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

      {/* ───────── Hero: order # + workflow stepper + smart next action ───────── */}
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

        <WorkflowStepper currentStatus={status} terminalKind={isTerminal ? status : null} />

        {/* Smart next action + cancel */}
        {!isTerminal && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
            <div className="flex-1 min-w-[240px]">
              <SmartNextButton
                action={next}
                pending={advanceMut.isPending}
                onFire={fireNext}
                hasPrice={hasPrice}
                hasDriver={hasDriver}
              />
              {next.hint && (
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {next.hint}
                </p>
              )}
            </div>
            {canCancel && (
              <Button variant="danger" onClick={() => setDialog('cancel')}>
                <Ban className="w-4 h-4" /> إلغاء الطلب
              </Button>
            )}
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
                  ⚡ طلب سريع · {String(customData?.mode ?? 'menu')}
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
            <Card
              title={`المنتجات (${order.items.length})`}
              icon={<MessageSquare className="w-4 h-4" />}
            >
              <ul className="divide-y divide-border">
                {order.items.map((it: Order, i: number) => (
                  <li key={i} className="py-2 flex items-center justify-between text-sm">
                    <span>
                      <span className="font-bold">{it.quantity}×</span> {it.productNameSnapshot}
                    </span>
                    {it.unitPriceSnapshot && (
                      <span className="text-muted-foreground">
                        {(Number(it.unitPriceSnapshot) * it.quantity).toLocaleString('ar-EG')} ج.م
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {customData &&
            Object.entries(customData).filter(([k]) => !renderedKeys.has(k)).length > 0 && (
              <Card title="بيانات إضافية" icon={<Phone className="w-4 h-4" />}>
                <dl className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm">
                  {Object.entries(customData)
                    .filter(([k]) => !renderedKeys.has(k))
                    .map(([k, v]) => {
                      const str = typeof v === 'string' ? v : JSON.stringify(v);
                      const display = str.length > 80 ? `${str.slice(0, 80)}…` : str;
                      return (
                        <div key={k} className="contents">
                          <dt className="text-muted-foreground">{k}</dt>
                          <dd className="col-span-2 font-mono text-xs truncate" title={str}>
                            {display}
                          </dd>
                        </div>
                      );
                    })}
                </dl>
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
                  onClick={() => setDialog('price')}
                >
                  <Edit3 className="w-3 h-3" /> تعديل السعر
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-amber-700 bg-amber-50 rounded p-2">
                  ⚠ الطلب لسه مش مسعّر
                </p>
                <Button size="sm" className="w-full" onClick={() => setDialog('price')}>
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
                    onClick={() => setDialog('assign')}
                  >
                    <Edit3 className="w-3 h-3" /> تغيير السائق
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">لم يتم تعيين سائق بعد</p>
                {!isTerminal && (
                  <Button size="sm" className="w-full" onClick={() => setDialog('assign')}>
                    <Truck className="w-4 h-4" /> تعيين سائق
                  </Button>
                )}
              </div>
            )}
          </Card>

          {/* Side actions */}
          <Card title="إجراءات" icon={<MessageSquare className="w-4 h-4" />}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialog('note')}
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

      {/* Action dialogs */}
      {dialog === 'price' && (
        <PriceDialog
          orderId={id!}
          initialPrice={order.quotedPrice ?? order.finalPrice}
          onClose={() => {
            setDialog(null);
            invalidate();
          }}
        />
      )}
      {dialog === 'assign' && (
        <AssignDialog
          orderId={id!}
          onClose={() => {
            setDialog(null);
            invalidate();
          }}
        />
      )}
      {dialog === 'cancel' && (
        <CancelDialog
          orderId={id!}
          onClose={() => {
            setDialog(null);
            invalidate();
          }}
        />
      )}
      {dialog === 'note' && (
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
// Workflow stepper — horizontal beaded line, one node per stage
// ────────────────────────────────────────────────────────────────────────────

function WorkflowStepper({
  currentStatus,
  terminalKind,
}: {
  currentStatus: OrderStatus;
  terminalKind: OrderStatus | null;
}) {
  // Legacy orders stuck on AWAITING_CUSTOMER_APPROVAL render as "PRICED" on
  // the strip — that's the most intuitive position now that the wait step
  // is gone.
  const effective = currentStatus === 'AWAITING_CUSTOMER_APPROVAL' ? 'PRICED' : currentStatus;
  const visibleStages = HAPPY_PATH;
  const currentIdx = Math.max(
    0,
    visibleStages.findIndex((s) => s.status === effective),
  );

  return (
    <div className="flex items-center justify-between gap-1 overflow-x-auto pb-2">
      {visibleStages.map((stage, i) => {
        const isDone = i < currentIdx;
        const isCurrent = i === currentIdx && !terminalKind;
        const isFuture = i > currentIdx;
        const isFailed = terminalKind === 'CANCELLED' || terminalKind === 'REJECTED';

        const dotStyle =
          isFailed && i >= currentIdx
            ? 'bg-gray-200 text-gray-400'
            : isDone
              ? 'bg-green-500 text-white'
              : isCurrent
                ? 'bg-brand-red text-white ring-4 ring-brand-red/20 animate-pulse'
                : 'bg-muted text-muted-foreground';

        const lineStyle = isDone ? 'bg-green-300' : 'bg-muted';

        return (
          <div key={stage.status} className="flex items-center flex-shrink-0">
            <div className="flex flex-col items-center gap-1 min-w-[64px]">
              <div
                className={`w-9 h-9 rounded-full grid place-items-center transition ${dotStyle}`}
                title={stage.label}
              >
                {isDone ? <Check className="w-4 h-4" /> : <stage.Icon className="w-4 h-4" />}
              </div>
              <div
                className={`text-[10px] text-center leading-tight ${
                  isCurrent ? 'font-bold text-brand-red' : 'text-muted-foreground'
                } ${isFuture ? 'opacity-60' : ''}`}
              >
                {stage.short}
              </div>
            </div>
            {i < visibleStages.length - 1 && (
              <div className={`h-1 w-6 sm:w-10 rounded-full mx-0.5 mt-[-18px] ${lineStyle}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Smart next button — single big CTA that knows what to do given state.
// ────────────────────────────────────────────────────────────────────────────

function SmartNextButton({
  action,
  pending,
  onFire,
  hasPrice,
  hasDriver,
}: {
  action: NextAction;
  pending: boolean;
  onFire: () => void;
  hasPrice: boolean;
  hasDriver: boolean;
}) {
  if (action.kind === 'wait-customer') {
    return (
      <div className="flex items-center gap-2 bg-blue-50 text-blue-800 rounded-lg px-4 py-3 text-sm">
        <Clock className="w-5 h-5 animate-pulse" />
        <span className="font-bold">{action.label}</span>
      </div>
    );
  }
  if (action.kind === 'terminal') {
    return null;
  }

  // Tone: amber when we still need a precondition (price/driver), green-ish
  // when we're just confirming progress.
  const isPrereqOpen = action.kind === 'price' || action.kind === 'assign';
  const Icon = action.kind === 'price' ? DollarSign : action.kind === 'assign' ? Truck : ArrowRight;

  return (
    <button
      type="button"
      onClick={onFire}
      disabled={pending}
      className={`w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold transition disabled:opacity-60 disabled:cursor-not-allowed ${
        isPrereqOpen
          ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/30'
          : 'bg-brand-red hover:bg-brand-red/90 text-white shadow-md shadow-brand-red/30'
      }`}
    >
      {pending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Icon className="w-5 h-5" />}
      <span>{action.label}</span>
      {!isPrereqOpen && !pending && <ArrowRight className="w-4 h-4 opacity-80" />}
      {action.kind === 'price' && !hasPrice && (
        <span className="bg-white/20 text-[10px] font-bold px-2 py-0.5 rounded-full ms-1">
          مطلوب
        </span>
      )}
      {action.kind === 'assign' && !hasDriver && (
        <span className="bg-white/20 text-[10px] font-bold px-2 py-0.5 rounded-full ms-1">
          مطلوب
        </span>
      )}
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

function PriceDialog({
  orderId,
  initialPrice,
  onClose,
}: {
  orderId: string;
  initialPrice?: number | string | null;
  onClose: () => void;
}) {
  const [price, setPrice] = useState(initialPrice != null ? String(initialPrice) : '');
  const mut = useMutation({
    mutationFn: () => api.adminSetPrice(orderId, Number(price)),
    onSuccess: () => {
      toast.success('تم حفظ السعر');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="تسعير الطلب">
      <Field label="السعر بالجنيه" required>
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          autoFocus
        />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>
          إلغاء
        </Button>
        <Button onClick={() => mut.mutate()} disabled={!price || mut.isPending}>
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

function AssignDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { data: drivers, isLoading } = useQuery({
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
  const items = (drivers?.items as Order[] | undefined) ?? [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="تعيين سائق">
      {isLoading ? (
        <div className="py-6 text-center text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" />
          جاري تحميل السائقين المتاحين...
        </div>
      ) : items.length === 0 ? (
        <p className="bg-amber-50 text-amber-800 rounded-lg p-3 text-sm">
          ⚠ مفيش سائقين متاحين دلوقتي. خلي السائق يفعّل حالته من تطبيق الكابتن.
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
