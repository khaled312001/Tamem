import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Loader2,
  MessageSquare,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Store,
  Truck,
  User,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '../components/ui/PageHeader.js';
import { TableSkeleton } from '../components/ui/Skeleton.js';
import { ErrorState } from '../components/ui/States.js';
import { api } from '../lib/api.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const EVENT_LABEL: Record<string, string> = {
  ORDER_NEW: 'طلب جديد',
  ORDER_PRICED: 'بعد التسعير',
  ORDER_ACCEPTED: 'قبول الطلب',
  DRIVER_ASSIGNED: 'تعيين سائق',
  PICKED_UP: 'استلام الطلب',
  IN_ROUTE: 'في الطريق',
  DELIVERED: 'الوصول',
  CANCELLED: 'الإلغاء',
};

const EVENT_ORDER = [
  'ORDER_NEW',
  'ORDER_PRICED',
  'ORDER_ACCEPTED',
  'DRIVER_ASSIGNED',
  'PICKED_UP',
  'IN_ROUTE',
  'DELIVERED',
  'CANCELLED',
];

const RECIPIENT: Record<string, { label: string; icon: typeof User; color: string }> = {
  CUSTOMER: { label: 'العميل', icon: User, color: 'text-blue-600 bg-blue-50' },
  DRIVER: { label: 'السائق', icon: Truck, color: 'text-purple-600 bg-purple-50' },
  SUPERVISOR: { label: 'المشرف', icon: Store, color: 'text-amber-600 bg-amber-50' },
  GROUP: { label: 'جروب الإدارة', icon: Users, color: 'text-green-600 bg-green-50' },
};

/** Local edit state for one template row. */
interface Draft {
  enabled: boolean;
  text: string;
}

/** Substitute {{var}} with a sample value for the live preview, and drop lines
 *  whose only content was an empty variable — matching the server renderer. */
function preview(text: string, samples: Record<string, string>): string {
  const filled = text.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (_m, k: string) => samples[k] ?? '');
  return filled
    .split('\n')
    .filter((ln) => {
      const t = ln.trim();
      if (t === '') return true;
      return !/^[^\p{L}\p{N}]*[\p{L}\p{N} ]+:\s*$/u.test(t);
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const SAMPLES: Record<string, string> = {
  orderNumber: 'TMM12AB34',
  customerName: 'أحمد محمد',
  customerPhone: '01000000000',
  driverName: 'خالد السائق',
  driverPhone: '01111111111',
  price: '150.00 ج.م',
  serviceName: 'دليفري',
  pickupAddress: 'قنا - شارع الجمهورية',
  deliveryAddress: 'قفط - أمام المستشفى',
  paymentMethod: 'كاش عند الاستلام',
  payment: 'كاش عند الاستلام — غير مدفوع',
  reason: 'العميل ألغى الطلب',
  // Multi-line values — mirror what the server composes at send time so the
  // preview shows the full message, not blank gaps.
  items: '• 2× بيتزا فراخ (75.00 ج.م)\n• 1× بيبسي (10.00 ج.م)',
  locations:
    '📍 الاستلام: قنا - شارع الجمهورية\n   📍 خريطة: https://maps.google.com/?q=26.16,32.72\n🏁 التوصيل: قفط - أمام المستشفى\n   📍 خريطة: https://maps.google.com/?q=25.99,32.81',
  priceBlock: 'قيمة الطلب: 160.00 ج.م\nالتوصيل: 25.00 ج.م\n*الإجمالي: 185.00 ج.م*',
  summary:
    '🧾 الطلب رقم *#TMM12AB34*\nالخدمة: دليفري\n\n🛒 التفاصيل:\n• 2× بيتزا فراخ\n\n📍 الاستلام: قنا\n🏁 التوصيل: قفط\n\n💳 الدفع: كاش عند الاستلام\nقيمة الطلب: 160.00 ج.م\nالتوصيل: 25.00 ج.م\n*الإجمالي: 185.00 ج.م*',
  collect: 'حصّل *185.00 ج.م* (كاش عند الاستلام)',
  shipping: 'الوزن: 2 كجم · الحجم: SMALL',
};

export function NotificationTemplatesPage() {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [openKey, setOpenKey] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'notification-templates'],
    queryFn: () => api.adminNotificationTemplates(),
  });

  // Seed drafts from server on first load; edits live in `drafts` after that.
  const templates = (data?.templates as Row[] | undefined) ?? [];
  const variables = data?.variables ?? {};

  const draftFor = (t: Row): Draft => drafts[t.key] ?? { enabled: t.enabled, text: t.text };
  const setDraft = (key: string, patch: Partial<Draft>, base: Draft) =>
    setDrafts((d) => ({ ...d, [key]: { ...base, ...d[key], ...patch } }));

  const dirty = Object.keys(drafts).length > 0;

  const save = useMutation({
    mutationFn: () => {
      // Send the full effective set so the server can drop keys back to default.
      const payload = templates.map((t) => {
        const d = draftFor(t);
        return { key: t.key, enabled: d.enabled, text: d.text };
      });
      return api.adminSaveNotificationTemplates(payload);
    },
    onSuccess: () => {
      toast.success('تم حفظ القوالب');
      setDrafts({});
      qc.invalidateQueries({ queryKey: ['admin', 'notification-templates'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Group by event for a scannable layout.
  const byEvent = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const t of templates) {
      if (!map.has(t.event)) map.set(t.event, []);
      map.get(t.event)!.push(t);
    }
    return EVENT_ORDER.filter((e) => map.has(e)).map((e) => [e, map.get(e)!] as const);
  }, [templates]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="قوالب الرسائل"
        subtitle="تحكّم في نص كل رسالة واتساب ومتى تتبعت — للعميل والسائق والمشرف والجروب"
        icon={Bell}
        crumbs={[{ label: 'ربط واتساب', to: '/whatsapp' }]}
        actions={
          <button
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-red text-white text-sm font-bold hover:bg-brand-red/90 disabled:opacity-50"
          >
            {save.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            حفظ التغييرات{dirty ? ` (${Object.keys(drafts).length})` : ''}
          </button>
        }
      />

      <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900 leading-6">
        استخدم المتغيرات دي جوه أي رسالة وهتتبدّل تلقائياً وقت الإرسال:
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {Object.entries(variables).map(([k, label]) => (
            <code
              key={k}
              className="px-1.5 py-0.5 rounded bg-white border border-blue-200 font-mono text-[11px]"
              title={String(label)}
            >
              {`{{${k}}}`}
            </code>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="bg-card rounded-xl border border-border p-6">
          <TableSkeleton rows={6} cols={3} />
        </div>
      ) : isError ? (
        <div className="bg-card rounded-xl border border-border">
          <ErrorState onRetry={() => refetch()} />
        </div>
      ) : (
        <div className="space-y-4">
          {byEvent.map(([event, rows]) => (
            <div key={event} className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/40 border-b border-border font-bold text-sm flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-brand-red" />
                {EVENT_LABEL[event] ?? event}
                <span className="text-xs font-normal text-muted-foreground">
                  ({rows.length} {rows.length === 1 ? 'رسالة' : 'رسائل'})
                </span>
              </div>
              <div className="divide-y divide-border/60">
                {rows.map((t) => {
                  const d = draftFor(t);
                  const meta = RECIPIENT[t.recipient] ?? {
                    label: t.recipient,
                    icon: User,
                    color: 'text-zinc-600 bg-zinc-50',
                  };
                  const isOpen = openKey === t.key;
                  const isDirty = !!drafts[t.key];
                  return (
                    <div key={t.key} className="p-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={`grid place-items-center w-8 h-8 rounded-lg shrink-0 ${meta.color}`}
                        >
                          <meta.icon className="w-4 h-4" />
                        </span>
                        <button
                          type="button"
                          onClick={() => setOpenKey(isOpen ? null : t.key)}
                          className="flex-1 min-w-0 text-start"
                        >
                          <div className="font-bold text-sm flex items-center gap-2">
                            {meta.label}
                            {isDirty && (
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-amber-500"
                                title="غير محفوظ"
                              />
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {d.enabled ? d.text.split('\n')[0] : 'موقوف — لن تُرسل'}
                          </div>
                        </button>

                        {/* enable toggle */}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={d.enabled}
                          onClick={() => setDraft(t.key, { enabled: !d.enabled }, d)}
                          title={d.enabled ? 'مفعّلة' : 'موقوفة'}
                          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
                            d.enabled ? 'bg-green-500' : 'bg-zinc-300'
                          }`}
                        >
                          <span
                            className={`absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-white shadow transition-[inset-inline-start] ${
                              d.enabled ? 'start-[22px]' : 'start-0.5'
                            }`}
                          />
                        </button>
                      </div>

                      {isOpen && (
                        <div className="mt-3 ps-11 space-y-2">
                          <textarea
                            value={d.text}
                            onChange={(e) => setDraft(t.key, { text: e.target.value }, d)}
                            rows={4}
                            dir="rtl"
                            className="w-full px-3 py-2 rounded-lg border border-input bg-popover text-sm font-mono leading-6 outline-none focus:ring-2 focus:ring-brand-red/30"
                            placeholder="نص الرسالة…"
                          />
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-muted-foreground">
                              {t.customized ? 'معدّلة عن الافتراضي' : 'النص الافتراضي'}
                            </span>
                            {t.text !== t.default && (
                              <button
                                type="button"
                                onClick={() => setDraft(t.key, { text: t.default }, d)}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-red hover:underline"
                              >
                                <RotateCcw className="w-3 h-3" />
                                استرجاع الافتراضي
                              </button>
                            )}
                          </div>

                          {/* preview */}
                          <div className="rounded-lg bg-[#e5ddd5] p-2.5">
                            <div className="bg-[#dcf8c6] rounded-lg rounded-tr-none p-2.5 max-w-[85%] ms-auto shadow-sm">
                              <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-5 text-zinc-800">
                                {preview(d.text, SAMPLES) || '—'}
                              </pre>
                            </div>
                            <div className="text-[10px] text-zinc-600 mt-1 text-center">
                              معاينة (ببيانات تجريبية)
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <ExtraRecipients event={event} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Recipient {
  id: string;
  name: string;
  phone: string;
  enabled: boolean;
  text: string;
}

/**
 * Per-event custom recipients: any phone number (another supervisor, an owner,
 * anyone) that also receives this event's message. Loads/saves the whole
 * recipients map but only renders + edits its own event's slice.
 */
function ExtraRecipients({ event }: { event: string }) {
  const qc = useQueryClient();
  const [list, setList] = useState<Recipient[] | null>(null);
  const [openEditor, setOpenEditor] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['admin', 'notification-recipients'],
    queryFn: () => api.adminNotificationRecipients(),
    staleTime: 60_000,
  });

  // Seed local state from the server slice once.
  const serverList = useMemo<Recipient[]>(
    () => ((data?.recipients?.[event] as Recipient[] | undefined) ?? []).map((r) => ({ ...r })),
    [data, event],
  );
  const rows = list ?? serverList;
  const dirty = list !== null;

  const save = useMutation({
    mutationFn: () => {
      // Merge our event's edits into the full map so other events are preserved.
      const full: Record<string, Recipient[]> = { ...(data?.recipients ?? {}) };
      full[event] = rows.filter((r) => r.phone.trim());
      return api.adminSaveNotificationRecipients(full);
    },
    onSuccess: () => {
      toast.success('تم حفظ المستقبِلين');
      setList(null);
      qc.invalidateQueries({ queryKey: ['admin', 'notification-recipients'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patch = (id: string, p: Partial<Recipient>) =>
    setList(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const add = () =>
    setList([...rows, { id: `new-${Date.now()}`, name: '', phone: '', enabled: true, text: '' }]);
  const remove = (id: string) => setList(rows.filter((r) => r.id !== id));

  return (
    <div className="border-t border-border bg-muted/20 px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-muted-foreground inline-flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          أرقام إضافية تستقبل هذا الإشعار{rows.length ? ` (${rows.length})` : ''}
        </span>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="text-xs font-bold text-white bg-brand-red px-2.5 py-1 rounded-md hover:bg-brand-red/90 disabled:opacity-50 inline-flex items-center gap-1"
            >
              {save.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Save className="w-3 h-3" />
              )}
              حفظ
            </button>
          )}
          <button
            onClick={add}
            className="text-xs font-bold text-brand-red hover:underline inline-flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            إضافة رقم
          </button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="mt-2 space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border border-border bg-card p-2">
              <div className="flex items-center gap-2">
                <input
                  value={r.name}
                  onChange={(e) => patch(r.id, { name: e.target.value })}
                  placeholder="الاسم (اختياري)"
                  className="w-32 shrink-0 px-2 py-1.5 rounded border border-input bg-popover text-xs"
                />
                <input
                  value={r.phone}
                  onChange={(e) => patch(r.id, { phone: e.target.value })}
                  placeholder="رقم الواتساب — 01xxxxxxxxx"
                  dir="ltr"
                  className="flex-1 min-w-0 px-2 py-1.5 rounded border border-input bg-popover text-xs font-mono text-right"
                />
                <button
                  type="button"
                  role="switch"
                  aria-checked={r.enabled}
                  onClick={() => patch(r.id, { enabled: !r.enabled })}
                  title={r.enabled ? 'مفعّل' : 'موقوف'}
                  className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
                    r.enabled ? 'bg-green-500' : 'bg-zinc-300'
                  }`}
                >
                  <span
                    className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-white shadow transition-[inset-inline-start] ${
                      r.enabled ? 'start-[18px]' : 'start-0.5'
                    }`}
                  />
                </button>
                <button
                  onClick={() => setOpenEditor(openEditor === r.id ? null : r.id)}
                  className="text-xs font-bold text-muted-foreground hover:text-foreground px-1.5"
                  title="تخصيص النص"
                >
                  ✎
                </button>
                <button
                  onClick={() => remove(r.id)}
                  aria-label="حذف"
                  className="p-1 rounded hover:bg-destructive/10 text-destructive shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {openEditor === r.id && (
                <div className="mt-2">
                  <textarea
                    value={r.text}
                    onChange={(e) => patch(r.id, { text: e.target.value })}
                    rows={3}
                    dir="rtl"
                    placeholder="اتركه فاضياً ليستقبل نفس رسالة المشرف، أو اكتب نصاً خاصاً بهذا الرقم…"
                    className="w-full px-2 py-1.5 rounded border border-input bg-popover text-xs font-mono leading-6"
                  />
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    فاضي = نفس رسالة المشرف لهذا الحدث. تقدر تستخدم نفس المتغيرات.
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
