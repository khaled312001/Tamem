import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Check,
  ChevronRight,
  ImageIcon,
  Loader2,
  MapPin,
  MessageSquare,
  Mic,
  Phone,
  User,
  X as XIcon,
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

  const updateStatus = useMutation({
    mutationFn: (status: OrderStatus) => api.adminUpdateOrderStatus(id!, status),
    onSuccess: () => {
      toast.success('تم تحديث الحالة');
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

  const allowed = (ORDER_TRANSITIONS[order.status as OrderStatus] ?? []) as OrderStatus[];
  const customData = order.customData as Record<string, unknown> | undefined;

  // Auto-scan customData for media attachments. Mobile dynamic forms with
  // image/audio fields can land here under any key (e.g. 'attachment',
  // 'photo', 'voice_note'), so we sniff each value instead of hardcoding.
  // Some mobile flows send raw base64 (no data URI prefix) — we coerce that
  // into a displayable data URI on the fly.
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
    if (looksLikeBase64Image(v)) {
      // Most camera uploads are JPEG; the browser will figure out the format
      // even if we guess wrong (it sniffs the binary header).
      return `data:image/jpeg;base64,${v}`;
    }
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
    else if (isImageRef(v)) collectedImages.push(normalizeImage(v));
    else if (isAudioRef(v)) collectedAudio.push(v);
  };
  // 1. Top-level order.imageUrls (canonical)
  if (Array.isArray(order.imageUrls)) (order.imageUrls as string[]).forEach(pushFrom);
  // 2. Anything inside customData
  if (customData) for (const v of Object.values(customData)) pushFrom(v);

  const imageUrls = Array.from(new Set(collectedImages));
  const audioUri = collectedAudio[0];
  // Track which customData keys we've already rendered visually so the
  // "بيانات إضافية" dump doesn't repeat them as raw base64.
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
  // Also skip the housekeeping keys our QuickOrder sheet writes
  ['audioUri', 'audioMime', 'audioDurationMs', 'quickOrder', 'mode', 'imageUrls'].forEach((k) =>
    renderedKeys.add(k),
  );

  return (
    <div className="space-y-4">
      <BackBar onBack={() => navigate('/orders')} />

      {/* Hero summary */}
      <div className="bg-white rounded-xl border border-border p-5 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[200px]">
          <div className="text-xs text-muted-foreground">رقم الطلب</div>
          <div className="font-mono text-lg font-black">{order.orderNumber}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {new Date(order.createdAt).toLocaleString('ar-EG')}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">الحالة</div>
          <StatusBadge status={order.status as OrderStatus} size="md" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">السعر</div>
          <div className="font-bold text-lg">
            {(order.finalPrice ?? order.quotedPrice)
              ? `${Number(order.finalPrice ?? order.quotedPrice).toLocaleString('ar-EG')} ج.م`
              : '—'}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {order.status === 'UNDER_REVIEW' && (
            <Button onClick={() => setDialog('price')}>تسعير الطلب</Button>
          )}
          {(order.status === 'ACCEPTED' || order.status === 'PRICED') && (
            <Button onClick={() => setDialog('assign')}>تعيين سائق</Button>
          )}
          {allowed
            .filter((s) => s !== 'CANCELLED' && s !== 'REJECTED')
            .map((s) => (
              <Button
                key={s}
                variant="outline"
                size="sm"
                onClick={() => updateStatus.mutate(s)}
                disabled={updateStatus.isPending}
              >
                {updateStatus.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <ArrowRight className="w-3 h-3" />
                )}
                {ORDER_STATUS_AR[s]}
              </Button>
            ))}
          {allowed.includes('CANCELLED' as OrderStatus) && (
            <Button variant="danger" size="sm" onClick={() => setDialog('cancel')}>
              <XIcon className="w-3 h-3" /> إلغاء
            </Button>
          )}
        </div>
      </div>

      {/* Main 2-col grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: customer + addresses + content */}
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

        {/* Right: service + driver + history */}
        <div className="space-y-4">
          <Card title="الخدمة">
            <div className="font-bold">{order.service?.nameAr ?? '—'}</div>
            <div className="text-xs text-muted-foreground mt-1">{order.category}</div>
          </Card>

          {order.assignedDriver && (
            <Card title="السائق" icon={<User className="w-4 h-4" />}>
              <div className="font-bold">{order.assignedDriver.name}</div>
              <a
                href={`tel:${order.assignedDriver.phone}`}
                className="text-sm text-brand-red"
                dir="ltr"
              >
                {order.assignedDriver.phone}
              </a>
              {order.assignedDriver.driverProfile && (
                <div className="mt-2">
                  <Badge>
                    {order.assignedDriver.driverProfile.vehicleType}{' '}
                    {order.assignedDriver.driverProfile.vehiclePlate}
                  </Badge>
                </div>
              )}
            </Card>
          )}

          <Card title="ملاحظة داخلية" icon={<MessageSquare className="w-4 h-4" />}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialog('note')}
              className="w-full"
            >
              <MessageSquare className="w-3 h-3" /> إضافة ملاحظة للفريق
            </Button>
          </Card>

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
          <Check className="w-4 h-4" /> حفظ السعر
        </Button>
      </div>
    </Dialog>
  );
}

function AssignDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
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
      <Field label="السائق المتاح" required>
        <select
          value={driverId}
          onChange={(e) => setDriverId(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-input bg-white text-sm"
        >
          <option value="">— اختر —</option>
          {(drivers?.items as Order[] | undefined)?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} — {d.driverProfile?.vehicleType} {d.driverProfile?.vehiclePlate}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>
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
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus />
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
    <Dialog open onOpenChange={(o) => !o && onClose()} title="إضافة ملاحظة">
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
