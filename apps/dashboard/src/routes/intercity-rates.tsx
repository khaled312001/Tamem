/**
 * أسعار ومواعيد التوصيل بين المدن.
 *
 * The ordinary zone tariff prices the CUSTOMER's address on its own, which is
 * right while every store is in the same town. It cannot say that قنا → قفط
 * costs more than قفط → قفط, nor that قنا → a village inside قفط costs more
 * again: the fee depends on BOTH ends of the trip. That is what this table is.
 *
 * A rule is (from city) → (destination at whatever precision you want). The
 * server resolves the most specific match first — area, then village, then the
 * whole city — so ONE city-wide row can cover everything and a single far
 * village can be overridden without touching it. That ordering is why the form
 * keeps only the narrowest destination chosen.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Loader2, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button.js';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Field, Input } from '../components/ui/Input.js';
import { CardSkeleton, EmptyState } from '../components/ui/Skeleton.js';
import { TimeDial } from '../components/ui/TimeDial.js';
import { api } from '../lib/api.js';

interface Window {
  label: string;
  /** آخر موعد لاستلام الطلب ضمن هذه الرحلة (HH:MM). */
  cutoff: string;
  /** الموعد المتوقع للتسليم (HH:MM). */
  delivery: string;
}

interface Rate {
  id: string;
  fromCity: string;
  toCityId: string | null;
  toVillageId: string | null;
  toAreaId: string | null;
  toLabel: string;
  price: number;
  minMinutes: number | null;
  maxMinutes: number | null;
  note: string | null;
  windows: Window[];
  isActive: boolean;
}

interface Zone {
  id: string;
  nameAr: string;
}

const EMPTY = {
  id: '',
  fromCity: '',
  toCityId: '',
  toVillageId: '',
  toAreaId: '',
  price: '',
  minMinutes: '',
  maxMinutes: '',
  note: '',
  windows: [] as Window[],
};
type Draft = typeof EMPTY;

export function IntercityRatesPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [confirmDel, setConfirmDel] = useState<Rate | null>(null);

  const { data: rates, isLoading } = useQuery({
    queryKey: ['admin', 'intercity-rates'],
    queryFn: () => api.raw.get('/admin/intercity-rates').then((r) => r.data.data as Rate[]),
  });

  // Cities that actually have stores — the "from" side is a merchant's city, so
  // offering anything else would create a rule that can never fire.
  const { data: merchants } = useQuery({
    queryKey: ['admin', 'merchants', 'places'],
    queryFn: () =>
      api.adminListMerchants({ pageSize: 200 }) as Promise<{ items: { city?: string | null }[] }>,
    staleTime: 5 * 60_000,
  });
  const fromCities = Array.from(
    new Set((merchants?.items ?? []).map((m) => (m.city ?? '').trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, 'ar'));

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'intercity-rates'] });

  const save = useMutation({
    mutationFn: (d: Draft) => {
      const body = {
        fromCity: d.fromCity.trim(),
        // Only the narrowest destination is sent: the server's "most specific
        // wins" ordering relies on the other levels being null.
        toAreaId: d.toAreaId || null,
        toVillageId: d.toAreaId ? null : d.toVillageId || null,
        toCityId: d.toAreaId || d.toVillageId ? null : d.toCityId || null,
        price: Number(d.price) || 0,
        minMinutes: d.minMinutes === '' ? null : Number(d.minMinutes),
        maxMinutes: d.maxMinutes === '' ? null : Number(d.maxMinutes),
        note: d.note.trim() || null,
        windows: d.windows.filter((w) => w.label.trim() && w.cutoff && w.delivery),
      };
      return d.id
        ? api.raw.patch(`/admin/intercity-rates/${d.id}`, body)
        : api.raw.post('/admin/intercity-rates', body);
    },
    onSuccess: () => {
      toast.success('تم الحفظ');
      setEditing(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || 'فشل الحفظ'),
  });

  const toggle = useMutation({
    mutationFn: (r: Rate) =>
      api.raw.patch(`/admin/intercity-rates/${r.id}`, { isActive: !r.isActive }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.raw.delete(`/admin/intercity-rates/${id}`),
    onSuccess: () => {
      toast.success('تم الحذف');
      setConfirmDel(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = rates ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-brand-dark">التوصيل بين المدن</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl leading-relaxed">
            لما المطعم يكون في مدينة والعميل في مدينة تانية. الرقم اللي بتحطه هنا{' '}
            <b className="text-foreground">بيتضاف فوق</b> سعر التوصيل العادي بتاع منطقة العميل — مش
            بيستبدله. يعني قرية في قفط = سعر توصيل القرية + رسوم النقل من قنا. تقدر تحط رسوم للمدينة
            كلها، وبعدين رسوم مختلفة لقرية أو منطقة معيّنة — الأخص هو اللي بيتطبّق.
          </p>
        </div>
        <Button onClick={() => setEditing({ ...EMPTY, fromCity: fromCities[0] ?? '' })}>
          <Plus className="w-4 h-4" />
          إضافة سعر
        </Button>
      </div>

      {isLoading ? (
        <CardSkeleton />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<MapPin className="w-8 h-8 text-brand-red" />}
          title="لسه مفيش أسعار بين المدن"
          description="من غير قاعدة هنا، أي طلب من مدينة تانية هياخد تسعيرة المنطقة العادية زي أي طلب محلي."
        />
      ) : (
        <div className="space-y-2">
          {list.map((r) => (
            <div
              key={r.id}
              className={`rounded-xl border p-3 bg-card flex flex-wrap items-center gap-3 ${
                r.isActive ? 'border-border' : 'border-dashed border-border/70 opacity-60'
              }`}
            >
              <div className="flex-1 min-w-[220px]">
                <div className="font-bold flex items-center gap-1.5 flex-wrap">
                  <span>من {r.fromCity}</span>
                  <span className="text-muted-foreground">←</span>
                  <span>{r.toLabel}</span>
                  {!r.toAreaId && !r.toVillageId && (
                    <span className="text-[10px] font-bold rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                      المدينة كلها
                    </span>
                  )}
                </div>
                {!!r.note && <div className="text-xs text-muted-foreground mt-0.5">{r.note}</div>}
                {(r.windows?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {r.windows.map((w, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground"
                      >
                        <Clock className="w-3 h-3" />
                        {w.label} · آخر طلب {w.cutoff} · تسليم {w.delivery}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-sm font-black text-brand-red whitespace-nowrap">
                + {r.price} ج.م
              </div>

              <div className="text-xs text-muted-foreground flex items-center gap-1 whitespace-nowrap">
                <Clock className="w-3.5 h-3.5" />
                {r.minMinutes != null && r.maxMinutes != null
                  ? `${r.minMinutes}–${r.maxMinutes} دقيقة`
                  : r.maxMinutes != null
                    ? `حتى ${r.maxMinutes} دقيقة`
                    : 'المدة مش محددة'}
              </div>

              <div className="flex items-center gap-1">
                <Button variant="ghost" onClick={() => toggle.mutate(r)}>
                  {r.isActive ? 'إيقاف' : 'تفعيل'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    setEditing({
                      id: r.id,
                      fromCity: r.fromCity,
                      toCityId: r.toCityId ?? '',
                      toVillageId: r.toVillageId ?? '',
                      toAreaId: r.toAreaId ?? '',
                      price: String(r.price),
                      minMinutes: r.minMinutes != null ? String(r.minMinutes) : '',
                      maxMinutes: r.maxMinutes != null ? String(r.maxMinutes) : '',
                      note: r.note ?? '',
                      windows: r.windows ?? [],
                    })
                  }
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="ghost" className="text-red-600" onClick={() => setConfirmDel(r)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <RateDialog
          draft={editing}
          fromCities={fromCities}
          saving={save.isPending}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onSave={() => save.mutate(editing)}
        />
      )}

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={(o) => !o && setConfirmDel(null)}
        title="حذف السعر؟"
        message={`هيتشال سعر «من ${confirmDel?.fromCity} ← ${confirmDel?.toLabel}». الطلبات الجاية من المدينة دي هتاخد تسعيرة المنطقة العادية.`}
        confirmLabel="حذف"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => confirmDel && remove.mutate(confirmDel.id)}
      />
    </div>
  );
}

function RateDialog({
  draft,
  fromCities,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  draft: Draft;
  fromCities: string[];
  saving: boolean;
  onChange: (d: Draft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const patch = (p: Partial<Draft>) => onChange({ ...draft, ...p });

  const { data: cities } = useQuery({
    queryKey: ['admin', 'zones', 'cities'],
    queryFn: () => api.raw.get('/admin/zones/cities').then((r) => r.data.data as Zone[]),
  });
  const { data: villages } = useQuery({
    queryKey: ['admin', 'zones', 'villages', draft.toCityId],
    queryFn: () =>
      api.raw
        .get(`/admin/zones/cities/${draft.toCityId}/villages`)
        .then((r) => r.data.data as Zone[]),
    enabled: !!draft.toCityId,
  });
  const { data: areas } = useQuery({
    queryKey: ['admin', 'zones', 'areas', draft.toVillageId],
    queryFn: () =>
      api.raw
        .get(`/admin/zones/villages/${draft.toVillageId}/areas`)
        .then((r) => r.data.data as Zone[]),
    enabled: !!draft.toVillageId,
  });

  // Narrowing the destination has to clear what sat below it, or the form would
  // claim a village that no longer belongs to the chosen city.
  useEffect(() => {
    if (!draft.toCityId && (draft.toVillageId || draft.toAreaId)) {
      onChange({ ...draft, toVillageId: '', toAreaId: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.toCityId]);

  const valid = draft.fromCity.trim() !== '' && draft.price !== '' && Number(draft.price) >= 0;

  const scope = draft.toAreaId
    ? 'المنطقة دي بس'
    : draft.toVillageId
      ? 'القرية دي كلها'
      : draft.toCityId
        ? 'المدينة دي كلها'
        : 'أي وجهة (احتياطي)';

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={draft.id ? 'تعديل السعر' : 'سعر جديد'}
    >
      <div className="space-y-3">
        <Field label="الطلب طالع من مدينة" required hint="مدينة المطعم — زي ما هي في بيانات المتجر">
          <select
            value={draft.fromCity}
            onChange={(e) => patch({ fromCity: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm font-bold outline-none focus:border-brand-red"
          >
            <option value="">— اختار —</option>
            {fromCities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <div className="rounded-lg bg-muted/40 p-3 space-y-2">
          <div className="text-xs font-bold text-foreground">وصولاً إلى</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select
              value={draft.toCityId}
              onChange={(e) => patch({ toCityId: e.target.value, toVillageId: '', toAreaId: '' })}
              className="px-3 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:border-brand-red"
            >
              <option value="">كل المدن</option>
              {(cities ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameAr}
                </option>
              ))}
            </select>
            <select
              value={draft.toVillageId}
              disabled={!draft.toCityId}
              onChange={(e) => patch({ toVillageId: e.target.value, toAreaId: '' })}
              className="px-3 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:border-brand-red disabled:opacity-50"
            >
              <option value="">كل القرى</option>
              {(villages ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nameAr}
                </option>
              ))}
            </select>
            <select
              value={draft.toAreaId}
              disabled={!draft.toVillageId}
              onChange={(e) => patch({ toAreaId: e.target.value })}
              className="px-3 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:border-brand-red disabled:opacity-50"
            >
              <option value="">كل المناطق</option>
              {(areas ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nameAr}
                </option>
              ))}
            </select>
          </div>
          <div className="text-[11px] text-muted-foreground">
            السعر ده هيتطبّق على: <b className="text-foreground">{scope}</b>. لو عملت سعر تاني لقرية
            أو منطقة جواها، هو اللي هيكسب.
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="رسوم النقل" required hint="بتتضاف فوق سعر المنطقة">
            <Input
              type="number"
              inputMode="decimal"
              value={draft.price}
              onChange={(e) => patch({ price: e.target.value })}
              placeholder="مثال: 35"
            />
          </Field>
          <Field label="أقل مدة" hint="بالدقايق">
            <Input
              type="number"
              inputMode="numeric"
              value={draft.minMinutes}
              onChange={(e) => patch({ minMinutes: e.target.value })}
              placeholder="45"
            />
          </Field>
          <Field label="أكبر مدة" hint="بالدقايق">
            <Input
              type="number"
              inputMode="numeric"
              value={draft.maxMinutes}
              onChange={(e) => patch({ maxMinutes: e.target.value })}
              placeholder="70"
            />
          </Field>
        </div>

        {/* Orders between cities are collected and driven in batches, not
            dispatched one by one, so the customer has to be told WHEN. Set on
            the city-wide rule; the narrower rules inherit it. */}
        <WindowsEditor value={draft.windows} onChange={(windows) => patch({ windows })} />

        <Field label="ملاحظة للعميل (اختياري)" hint="بتظهر جنب المدة في التطبيق">
          <Input
            value={draft.note}
            onChange={(e) => patch({ note: e.target.value })}
            placeholder="مثال: الطلب بيتجمّع ويتشحن مرتين يومياً"
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={onSave} disabled={!valid || saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * مواعيد الرحلات. Two a day here — noon and night — so this is a small list,
 * not a weekly schedule. Each entry is what the customer needs to decide: the
 * last moment to get into this run, and when it lands.
 */
function WindowsEditor({ value, onChange }: { value: Window[]; onChange: (v: Window[]) => void }) {
  const patch = (i: number, p: Partial<Window>) =>
    onChange(value.map((w, j) => (i === j ? { ...w, ...p } : w)));

  return (
    <div className="rounded-lg bg-muted/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold text-foreground">مواعيد الرحلات</div>
        <button
          type="button"
          onClick={() => onChange([...value, { label: '', cutoff: '', delivery: '' }])}
          className="text-xs font-bold text-brand-red hover:underline"
        >
          + إضافة رحلة
        </button>
      </div>

      {value.length === 0 ? (
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          سيبها فاضية لو التوصيل متاح طول اليوم. لو الطلبات بتتجمّع وتتشحن على دفعات، ضيف كل رحلة
          بموعدها — العميل هيشوفها في التطبيق قبل ما يطلب.
        </p>
      ) : (
        <div className="space-y-2">
          {value.map((w, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  value={w.label}
                  onChange={(e) => patch(i, { label: e.target.value })}
                  placeholder="مثال: رحلة الظهر"
                />
                <button
                  type="button"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                  className="text-red-600 p-1.5 rounded hover:bg-red-50 shrink-0"
                  aria-label="حذف الرحلة"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TimeDial
                  label="آخر موعد للطلب"
                  value={w.cutoff || '11:00'}
                  onChange={(cutoff) => patch(i, { cutoff })}
                />
                <TimeDial
                  label="موعد التسليم"
                  value={w.delivery || '14:00'}
                  onChange={(delivery) => patch(i, { delivery })}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
