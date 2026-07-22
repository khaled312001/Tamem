import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DollarSign, Loader2, MapPin, Pencil, Plus, Save, Trash2, Truck, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Field, Input } from '../components/ui/Input.js';
import { CardSkeleton, EmptyState } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';
import { cn } from '../lib/utils.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

export function PricingPage() {
  // التسعير عن طريق المناطق فقط — قواعد التسعير القديمة اتشالت بناءً على طلب
  // الإدارة، والسعر بيتحدد من منطقة التوصيل (المدينة/القرية/المنطقة).
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black text-brand-dark">التسعير</h1>
        <p className="text-sm text-muted-foreground mt-1">
          إدارة أسعار التوصيل حسب المنطقة (المدينة / القرية / المنطقة)
        </p>
      </div>

      <DeliveryZonesTab />

      <div className="pt-2 border-t border-border" />
      <ShippingPricesTab />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Shipping between regions — the region→region price table (SHIPPING service).
// Backed by the `shipping_prices` Setting via GET/PUT /admin/shipping-prices.
// ────────────────────────────────────────────────────────────────────────────

interface ShipRule {
  from: string[];
  to: string[];
  normal: number;
  express: number;
}
interface ShipCfg {
  regions: string[];
  rules: ShipRule[];
  default: { normal: number; express: number };
}

const WILDCARD = '*';

function ShippingPricesTab() {
  const qc = useQueryClient();
  const [cfg, setCfg] = useState<ShipCfg | null>(null);
  const [newRegion, setNewRegion] = useState('');

  const cfgQ = useQuery({
    queryKey: ['admin', 'shipping-prices'],
    queryFn: async (): Promise<ShipCfg> => {
      const res = await api.raw.get<{ data: ShipCfg }>('/admin/shipping-prices');
      return res.data.data;
    },
  });

  // Seed the editable copy once the server config arrives.
  useEffect(() => {
    if (cfgQ.data && !cfg) setCfg(structuredClone(cfgQ.data));
  }, [cfgQ.data, cfg]);

  const saveMut = useMutation({
    mutationFn: async (next: ShipCfg) => {
      const res = await api.raw.put<{ data: ShipCfg }>('/admin/shipping-prices', next);
      return res.data.data;
    },
    onSuccess: (saved) => {
      toast.success('تم حفظ أسعار الشحن');
      qc.setQueryData(['admin', 'shipping-prices'], saved);
      setCfg(structuredClone(saved));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (cfgQ.isLoading || !cfg) {
    return (
      <section className="space-y-3">
        <CardSkeleton />
        <CardSkeleton />
      </section>
    );
  }

  const patch = (fn: (draft: ShipCfg) => void) => {
    setCfg((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  };

  const addRegion = () => {
    const name = newRegion.trim();
    if (!name) return;
    if (cfg.regions.includes(name)) {
      toast.error('المنطقة موجودة بالفعل');
      return;
    }
    patch((d) => d.regions.push(name));
    setNewRegion('');
  };

  const removeRegion = (name: string) => {
    patch((d) => {
      d.regions = d.regions.filter((r) => r !== name);
      // Drop the region from any rule that references it.
      for (const rule of d.rules) {
        rule.from = rule.from.filter((r) => r !== name);
        rule.to = rule.to.filter((r) => r !== name);
      }
    });
  };

  const toggleInSet = (ruleIdx: number, side: 'from' | 'to', region: string) => {
    patch((d) => {
      const set = d.rules[ruleIdx]![side];
      if (region === WILDCARD) {
        d.rules[ruleIdx]![side] = set.includes(WILDCARD) ? [] : [WILDCARD];
        return;
      }
      const cleaned = set.filter((r) => r !== WILDCARD);
      d.rules[ruleIdx]![side] = cleaned.includes(region)
        ? cleaned.filter((r) => r !== region)
        : [...cleaned, region];
    });
  };

  const addRule = () => patch((d) => d.rules.push({ from: [], to: [], normal: 100, express: 120 }));
  const removeRule = (idx: number) => patch((d) => d.rules.splice(idx, 1));

  const dirty = JSON.stringify(cfg) !== JSON.stringify(cfgQ.data);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-black text-brand-dark flex items-center gap-2">
            <Truck className="w-5 h-5 text-brand-red" />
            أسعار الشحن بين المناطق
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            سعر الشحن بيتحسب حسب منطقة الانطلاق ومنطقة الوصول. «الكل» يعني أي منطقة.
          </p>
        </div>
        <Button
          size="md"
          onClick={() => saveMut.mutate(cfg)}
          disabled={!dirty || saveMut.isPending}
        >
          {saveMut.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          حفظ التغييرات
        </Button>
      </div>

      {/* Regions manager */}
      <div className="bg-white rounded-xl border border-border p-5 space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
          المناطق المتاحة للشحن
        </div>
        <div className="flex flex-wrap gap-2">
          {cfg.regions.map((r) => (
            <span
              key={r}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-red/10 text-brand-dark text-sm font-bold"
            >
              {r}
              <button
                type="button"
                onClick={() => removeRegion(r)}
                className="text-brand-red/70 hover:text-brand-red"
                title="حذف المنطقة"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
          {cfg.regions.length === 0 && (
            <span className="text-sm text-muted-foreground">لا توجد مناطق — أضف منطقة.</span>
          )}
        </div>
        <div className="flex items-center gap-2 max-w-sm">
          <Input
            value={newRegion}
            onChange={(e) => setNewRegion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addRegion()}
            placeholder="اسم منطقة جديدة"
          />
          <Button variant="outline" size="md" onClick={addRegion}>
            <Plus className="w-4 h-4" />
            إضافة
          </Button>
        </div>
      </div>

      {/* Rules */}
      <div className="space-y-3">
        {cfg.rules.map((rule, idx) => (
          <div key={idx} className="bg-white rounded-xl border border-border p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-black text-brand-dark">قاعدة {idx + 1}</div>
              <Button variant="ghost" size="sm" onClick={() => removeRule(idx)} title="حذف القاعدة">
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>

            <RegionSetPicker
              label="من"
              regions={cfg.regions}
              selected={rule.from}
              onToggle={(r) => toggleInSet(idx, 'from', r)}
            />
            <RegionSetPicker
              label="إلى"
              regions={cfg.regions}
              selected={rule.to}
              onToggle={(r) => toggleInSet(idx, 'to', r)}
            />

            <div className="grid grid-cols-2 gap-3 max-w-md">
              <Field label="عادي (ج.م)">
                <Input
                  type="number"
                  min={0}
                  step="1"
                  value={String(rule.normal)}
                  onChange={(e) =>
                    patch((d) => (d.rules[idx]!.normal = Number(e.target.value) || 0))
                  }
                />
              </Field>
              <Field label="سريع / إكسبريس (ج.م)">
                <Input
                  type="number"
                  min={0}
                  step="1"
                  value={String(rule.express)}
                  onChange={(e) =>
                    patch((d) => (d.rules[idx]!.express = Number(e.target.value) || 0))
                  }
                />
              </Field>
            </div>
          </div>
        ))}

        <Button variant="outline" size="md" onClick={addRule}>
          <Plus className="w-4 h-4" />
          إضافة قاعدة سعر
        </Button>
      </div>

      {/* Default fallback price */}
      <div className="bg-white rounded-xl border border-border p-5 space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
          السعر الافتراضي (لو مفيش قاعدة مطابقة)
        </div>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <Field label="عادي (ج.م)">
            <Input
              type="number"
              min={0}
              step="1"
              value={String(cfg.default.normal)}
              onChange={(e) => patch((d) => (d.default.normal = Number(e.target.value) || 0))}
            />
          </Field>
          <Field label="سريع / إكسبريس (ج.م)">
            <Input
              type="number"
              min={0}
              step="1"
              value={String(cfg.default.express)}
              onChange={(e) => patch((d) => (d.default.express = Number(e.target.value) || 0))}
            />
          </Field>
        </div>
      </div>
    </section>
  );
}

function RegionSetPicker({
  label,
  regions,
  selected,
  onToggle,
}: {
  label: string;
  regions: string[];
  selected: string[];
  onToggle: (region: string) => void;
}) {
  const chip = (value: string, text: string) => {
    const on = selected.includes(value);
    return (
      <button
        key={value}
        type="button"
        onClick={() => onToggle(value)}
        className={cn(
          'px-3 py-1.5 rounded-full text-sm font-bold border transition',
          on
            ? 'bg-brand-red text-white border-brand-red'
            : 'bg-white text-ink border-border hover:border-brand-red/50',
        )}
      >
        {text}
      </button>
    );
  };
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-bold text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-2">
        {chip(WILDCARD, 'الكل')}
        {regions.map((r) => chip(r, r))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tab 2: Delivery zones (City → Village → Area cascade with price editing)
// ────────────────────────────────────────────────────────────────────────────

interface City {
  id: string;
  nameAr: string;
  nameEn?: string | null;
  isActive: boolean;
  villageCount?: number;
  areaCount?: number;
}

interface Village {
  id: string;
  cityId: string;
  nameAr: string;
  nameEn?: string | null;
  baseDeliveryPrice?: string | number | null;
  isActive: boolean;
  areaCount?: number;
}

interface Area {
  id: string;
  villageId: string;
  nameAr: string;
  nameEn?: string | null;
  deliveryPrice?: string | number | null;
  isActive: boolean;
}

interface Paginated<T> {
  data: T[];
  pagination?: { page: number; pageSize: number; total: number };
}

type DialogMode =
  | { kind: 'none' }
  | { kind: 'create-city' }
  | { kind: 'create-village' }
  | { kind: 'create-area' }
  | { kind: 'edit-area'; area: Row }
  | { kind: 'edit-village-base' };

function toNumberOrNull(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

function DeliveryZonesTab() {
  const qc = useQueryClient();
  const [cityId, setCityId] = useState<string>('');
  const [villageId, setVillageId] = useState<string>('');
  const [areaId, setAreaId] = useState<string>('');
  const [priceInput, setPriceInput] = useState<string>('');
  const [dialog, setDialog] = useState<DialogMode>({ kind: 'none' });

  // ── Cities ─────────────────────────────────────────────────────────────
  const citiesQ = useQuery({
    queryKey: ['admin', 'zones', 'cities'],
    queryFn: async (): Promise<City[]> => {
      const res = await api.raw.get<Paginated<City>>('/admin/zones/cities');
      return res.data.data;
    },
  });

  // Preselect single city (e.g. قفط) when list loads
  useEffect(() => {
    if (!cityId && citiesQ.data && citiesQ.data.length > 0) {
      const first = citiesQ.data[0];
      if (first) setCityId(first.id);
    }
  }, [citiesQ.data, cityId]);

  // ── Villages ───────────────────────────────────────────────────────────
  const villagesQ = useQuery({
    queryKey: ['admin', 'zones', 'villages', cityId],
    enabled: !!cityId,
    queryFn: async (): Promise<Village[]> => {
      const res = await api.raw.get<Paginated<Village>>(`/admin/zones/cities/${cityId}/villages`);
      return res.data.data;
    },
  });

  // Reset downstream selections when city changes
  useEffect(() => {
    setVillageId('');
    setAreaId('');
    setPriceInput('');
  }, [cityId]);

  // ── Areas ──────────────────────────────────────────────────────────────
  const areasQ = useQuery({
    queryKey: ['admin', 'zones', 'areas', villageId],
    enabled: !!villageId,
    queryFn: async (): Promise<Area[]> => {
      const res = await api.raw.get<Paginated<Area>>(`/admin/zones/villages/${villageId}/areas`);
      return res.data.data;
    },
  });

  useEffect(() => {
    setAreaId('');
    setPriceInput('');
  }, [villageId]);

  // Sync price input when area changes
  const selectedCity = useMemo(
    () => citiesQ.data?.find((c) => c.id === cityId) ?? null,
    [citiesQ.data, cityId],
  );
  const selectedVillage = useMemo(
    () => villagesQ.data?.find((v) => v.id === villageId) ?? null,
    [villagesQ.data, villageId],
  );
  const selectedArea = useMemo(
    () => areasQ.data?.find((a) => a.id === areaId) ?? null,
    [areasQ.data, areaId],
  );

  useEffect(() => {
    if (!selectedArea) {
      setPriceInput('');
      return;
    }
    const n = toNumberOrNull(selectedArea.deliveryPrice ?? null);
    setPriceInput(n === null ? '' : String(n));
  }, [selectedArea]);

  // ── Mutations ──────────────────────────────────────────────────────────
  const updateAreaPriceMut = useMutation({
    mutationFn: async (input: { areaId: string; deliveryPrice: number }) => {
      await api.raw.patch(`/admin/zones/areas/${input.areaId}`, {
        deliveryPrice: input.deliveryPrice,
      });
    },
    onSuccess: () => {
      toast.success('تم حفظ سعر المنطقة');
      qc.invalidateQueries({ queryKey: ['admin', 'zones', 'areas', villageId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteAreaMut = useMutation({
    mutationFn: async (id: string) => {
      await api.raw.delete(`/admin/zones/areas/${id}`);
    },
    onSuccess: () => {
      toast.success('تم حذف المنطقة');
      qc.invalidateQueries({ queryKey: ['admin', 'zones', 'areas', villageId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteVillageMut = useMutation({
    mutationFn: async (id: string) => {
      await api.raw.delete(`/admin/zones/villages/${id}`);
    },
    onSuccess: () => {
      toast.success('تم حذف القرية');
      setVillageId('');
      qc.invalidateQueries({ queryKey: ['admin', 'zones', 'villages', cityId] });
      qc.invalidateQueries({ queryKey: ['admin', 'zones', 'cities'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Submit handler for the price form ──────────────────────────────────
  const handleSavePrice = () => {
    if (!cityId) {
      toast.error('اختر المدينة أولاً');
      return;
    }
    if (!villageId) {
      toast.error('اختر القرية أولاً');
      return;
    }
    if (!areaId) {
      toast.error('اختر المنطقة أولاً');
      return;
    }
    const trimmed = priceInput.trim();
    if (trimmed === '') {
      toast.error('أدخل السعر');
      return;
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num < 0) {
      toast.error('السعر يجب أن يكون رقماً موجباً');
      return;
    }
    updateAreaPriceMut.mutate({ areaId, deliveryPrice: num });
  };

  const villageBasePrice = toNumberOrNull(selectedVillage?.baseDeliveryPrice ?? null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-black text-brand-dark flex items-center gap-2">
            <MapPin className="w-5 h-5 text-brand-red" />
            مناطق التوصيل
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            اختر المدينة ثم القرية ثم المنطقة لتعديل رسوم التوصيل.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* City is fixed to قفط — no "add city" here on purpose. */}
          <Button
            variant="outline"
            size="md"
            onClick={() => setDialog({ kind: 'create-village' })}
            disabled={!cityId}
          >
            <Plus className="w-4 h-4" />
            إضافة قرية
          </Button>
          <Button
            size="md"
            onClick={() => setDialog({ kind: 'create-area' })}
            disabled={!villageId}
          >
            <Plus className="w-4 h-4" />
            إضافة منطقة
          </Button>
        </div>
      </div>

      {/* Cascade selects */}
      <section className="bg-white rounded-xl border border-border p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="المدينة" required hint="المدينة ثابتة على قفط">
            {citiesQ.isLoading ? (
              <div className="h-10 rounded-lg bg-muted animate-pulse" />
            ) : (
              // City is locked to قفط: the select is disabled so it can never be
              // changed, and the load effect always re-selects the قفط city.
              <select
                value={cityId}
                disabled
                aria-readonly
                className="w-full px-3 py-2 rounded-lg border border-input bg-muted text-sm cursor-not-allowed outline-none"
              >
                {(citiesQ.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameAr}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label="القرية" required>
            {villagesQ.isLoading && !!cityId ? (
              <div className="h-10 rounded-lg bg-muted animate-pulse" />
            ) : (
              <select
                value={villageId}
                onChange={(e) => setVillageId(e.target.value)}
                disabled={!cityId}
                className="w-full px-3 py-2 rounded-lg border border-input bg-white text-sm disabled:bg-muted disabled:cursor-not-allowed focus:border-brand-red focus:ring-2 focus:ring-brand-red/20 outline-none transition"
              >
                <option value="">— اختر —</option>
                {(villagesQ.data ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nameAr}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label="المنطقة" required>
            {areasQ.isLoading && !!villageId ? (
              <div className="h-10 rounded-lg bg-muted animate-pulse" />
            ) : (
              <select
                value={areaId}
                onChange={(e) => setAreaId(e.target.value)}
                disabled={!villageId}
                className="w-full px-3 py-2 rounded-lg border border-input bg-white text-sm disabled:bg-muted disabled:cursor-not-allowed focus:border-brand-red focus:ring-2 focus:ring-brand-red/20 outline-none transition"
              >
                <option value="">— اختر —</option>
                {(areasQ.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nameAr}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        {selectedCity && (
          <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            <strong>{selectedCity.nameAr}</strong>
            {typeof selectedCity.villageCount === 'number' && (
              <> · {selectedCity.villageCount} قرية</>
            )}
            {typeof selectedCity.areaCount === 'number' && <> · {selectedCity.areaCount} منطقة</>}
          </div>
        )}
      </section>

      {/* Village base price card */}
      {selectedVillage && (
        <section className="bg-white rounded-xl border border-border p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
                السعر الأساسي للقرية
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-black text-brand-dark">
                  {villageBasePrice !== null ? villageBasePrice.toFixed(2) : '—'}
                </span>
                {villageBasePrice !== null && (
                  <span className="text-sm text-muted-foreground">ج.م</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedVillage.nameAr} · يُستخدم تلقائياً للمناطق بدون سعر مخصص
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialog({ kind: 'edit-village-base' })}
              >
                <Pencil className="w-3.5 h-3.5" />
                تعديل القرية
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (confirm(`حذف قرية "${selectedVillage.nameAr}" وكل مناطقها؟`)) {
                    deleteVillageMut.mutate(selectedVillage.id);
                  }
                }}
              >
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Area price form */}
      <section className="bg-white rounded-xl border border-border p-5 space-y-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-1.5">
          <DollarSign className="w-4 h-4" />
          سعر المنطقة المختارة
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
          <Field label="رسم التوصيل (ج.م)">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              placeholder={
                villageBasePrice !== null
                  ? `الافتراضي: ${villageBasePrice.toFixed(2)} (سعر القرية)`
                  : 'مثلاً: 25.00'
              }
              disabled={!areaId}
            />
          </Field>
          <Button
            onClick={handleSavePrice}
            disabled={!areaId || updateAreaPriceMut.isPending}
            size="lg"
          >
            {updateAreaPriceMut.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            حفظ السعر
          </Button>
        </div>
        {selectedArea && (
          <p className="text-xs text-muted-foreground">
            تعديل <strong>{selectedArea.nameAr}</strong> ضمن{' '}
            <strong>{selectedVillage?.nameAr}</strong>.
          </p>
        )}
      </section>

      {/* Areas table for the selected village */}
      <section className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
          <div className="font-bold text-sm">مناطق {selectedVillage?.nameAr ?? 'القرية'}</div>
          {areasQ.data && (
            <div className="text-xs text-muted-foreground">{areasQ.data.length} منطقة</div>
          )}
        </div>

        {!villageId ? (
          <EmptyState
            icon={<MapPin className="w-12 h-12" />}
            title="اختر قرية لعرض مناطقها"
            description="يجب اختيار مدينة ثم قرية لإدارة أسعار المناطق."
          />
        ) : areasQ.isLoading ? (
          <div className="p-6 space-y-3">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : !areasQ.data?.length ? (
          <EmptyState
            icon={<MapPin className="w-12 h-12" />}
            title="لا توجد مناطق"
            description="أضف منطقة جديدة عبر زر «إضافة منطقة» أعلى الصفحة."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr className="text-right">
                  <th className="px-4 py-3 font-bold">المنطقة</th>
                  <th className="px-4 py-3 font-bold">الرسم</th>
                  <th className="px-4 py-3 font-bold">الحالة</th>
                  <th className="px-4 py-3 w-24" />
                </tr>
              </thead>
              <tbody>
                {areasQ.data.map((a) => {
                  const price = toNumberOrNull(a.deliveryPrice ?? null);
                  const selected = a.id === areaId;
                  return (
                    <tr
                      key={a.id}
                      className={cn(
                        'border-b border-border/50 cursor-pointer hover:bg-muted/30 transition',
                        selected && 'bg-brand-red/5',
                      )}
                      onClick={() => setAreaId(a.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-bold text-ink">{a.nameAr}</div>
                        {a.nameEn && (
                          <div className="text-xs text-muted-foreground">{a.nameEn}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {price !== null ? (
                          <span className="font-bold">{price.toFixed(2)} ج.م</span>
                        ) : (
                          <span className="text-muted-foreground">— يستخدم سعر القرية</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-block px-2 py-0.5 rounded-md text-xs font-bold',
                            a.isActive
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-600',
                          )}
                        >
                          {a.isActive ? 'مفعّلة' : 'موقوفة'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDialog({ kind: 'edit-area', area: a });
                            }}
                            title="تعديل"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`حذف ${a.nameAr}?`)) {
                                deleteAreaMut.mutate(a.id);
                              }
                            }}
                            title="حذف"
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Dialogs */}
      {dialog.kind === 'create-city' && (
        <CreateCityDialog onClose={() => setDialog({ kind: 'none' })} />
      )}
      {dialog.kind === 'create-village' && cityId && (
        <CreateVillageDialog cityId={cityId} onClose={() => setDialog({ kind: 'none' })} />
      )}
      {dialog.kind === 'create-area' && villageId && (
        <CreateAreaDialog villageId={villageId} onClose={() => setDialog({ kind: 'none' })} />
      )}
      {dialog.kind === 'edit-area' && (
        <EditAreaDialog
          area={dialog.area}
          villageId={villageId}
          onClose={() => setDialog({ kind: 'none' })}
        />
      )}
      {dialog.kind === 'edit-village-base' && selectedVillage && (
        <EditVillageBasePriceDialog
          village={selectedVillage}
          onClose={() => setDialog({ kind: 'none' })}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Zone dialogs
// ────────────────────────────────────────────────────────────────────────────

function CreateCityDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');

  const mut = useMutation({
    mutationFn: async () => {
      await api.raw.post('/admin/zones/cities', {
        nameAr: nameAr.trim(),
        ...(nameEn.trim() ? { nameEn: nameEn.trim() } : {}),
      });
    },
    onSuccess: () => {
      toast.success('تمت إضافة المدينة');
      qc.invalidateQueries({ queryKey: ['admin', 'zones', 'cities'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canSubmit = nameAr.trim().length > 1;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="إضافة مدينة" size="sm">
      <div className="space-y-3">
        <Field label="الاسم بالعربية" required>
          <Input
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            placeholder="قنا"
            autoFocus
          />
        </Field>
        <Field label="الاسم بالإنجليزية (اختياري)">
          <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Qena" />
        </Field>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" size="md" onClick={onClose}>
          إلغاء
        </Button>
        <Button onClick={() => mut.mutate()} disabled={!canSubmit || mut.isPending}>
          {mut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          حفظ
        </Button>
      </div>
    </Dialog>
  );
}

function CreateVillageDialog({ cityId, onClose }: { cityId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [basePrice, setBasePrice] = useState('');

  const mut = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        cityId,
        nameAr: nameAr.trim(),
      };
      if (nameEn.trim()) body.nameEn = nameEn.trim();
      if (basePrice.trim() !== '') {
        const n = Number(basePrice);
        if (!Number.isFinite(n) || n < 0) {
          throw new Error('السعر الأساسي يجب أن يكون رقماً موجباً');
        }
        body.baseDeliveryPrice = n;
      }
      await api.raw.post('/admin/zones/villages', body);
    },
    onSuccess: () => {
      toast.success('تمت إضافة القرية');
      qc.invalidateQueries({ queryKey: ['admin', 'zones', 'villages', cityId] });
      qc.invalidateQueries({ queryKey: ['admin', 'zones', 'cities'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canSubmit = nameAr.trim().length > 1;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="إضافة قرية" size="sm">
      <div className="space-y-3">
        <Field label="الاسم بالعربية" required>
          <Input
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            placeholder="قفط المدينة"
            autoFocus
          />
        </Field>
        <Field label="الاسم بالإنجليزية (اختياري)">
          <Input
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            placeholder="Qift City"
          />
        </Field>
        <Field label="السعر الأساسي (اختياري)" hint="يُستخدم للمناطق التي بدون سعر مخصص">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={basePrice}
            onChange={(e) => setBasePrice(e.target.value)}
            placeholder="0.00"
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" size="md" onClick={onClose}>
          إلغاء
        </Button>
        <Button onClick={() => mut.mutate()} disabled={!canSubmit || mut.isPending}>
          {mut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          حفظ
        </Button>
      </div>
    </Dialog>
  );
}

function CreateAreaDialog({ villageId, onClose }: { villageId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [price, setPrice] = useState('');

  const mut = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        villageId,
        nameAr: nameAr.trim(),
      };
      if (nameEn.trim()) body.nameEn = nameEn.trim();
      if (price.trim() !== '') {
        const n = Number(price);
        if (!Number.isFinite(n) || n < 0) {
          throw new Error('السعر يجب أن يكون رقماً موجباً');
        }
        body.deliveryPrice = n;
      }
      await api.raw.post('/admin/zones/areas', body);
    },
    onSuccess: () => {
      toast.success('تمت إضافة المنطقة');
      qc.invalidateQueries({ queryKey: ['admin', 'zones', 'areas', villageId] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canSubmit = nameAr.trim().length > 1;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="إضافة منطقة" size="sm">
      <div className="space-y-3">
        <Field label="الاسم بالعربية" required>
          <Input
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            placeholder="السوق"
            autoFocus
          />
        </Field>
        <Field label="الاسم بالإنجليزية (اختياري)">
          <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="El Sooq" />
        </Field>
        <Field label="رسم التوصيل (اختياري)" hint="اتركه فارغاً لاستخدام سعر القرية">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" size="md" onClick={onClose}>
          إلغاء
        </Button>
        <Button onClick={() => mut.mutate()} disabled={!canSubmit || mut.isPending}>
          {mut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          حفظ
        </Button>
      </div>
    </Dialog>
  );
}

function EditAreaDialog({
  area,
  villageId,
  onClose,
}: {
  area: Row;
  villageId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [nameAr, setNameAr] = useState<string>(area?.nameAr ?? '');
  const [price, setPrice] = useState<string>(
    area?.deliveryPrice != null ? String(Number(area.deliveryPrice)) : '',
  );

  const mut = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { nameAr: nameAr.trim() };
      if (price.trim() === '') body.deliveryPrice = null;
      else {
        const n = Number(price);
        if (!Number.isFinite(n) || n < 0) throw new Error('السعر يجب أن يكون رقماً موجباً');
        body.deliveryPrice = n;
      }
      await api.raw.patch(`/admin/zones/areas/${area.id}`, body);
    },
    onSuccess: () => {
      toast.success('تم تعديل المنطقة');
      qc.invalidateQueries({ queryKey: ['admin', 'zones', 'areas', villageId] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canSubmit = nameAr.trim().length > 1;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="تعديل المنطقة" size="sm">
      <div className="space-y-3">
        <Field label="اسم المنطقة" required>
          <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} autoFocus />
        </Field>
        <Field label="رسم التوصيل" hint="اتركه فارغاً لاستخدام سعر القرية">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" size="md" onClick={onClose}>
          إلغاء
        </Button>
        <Button onClick={() => mut.mutate()} disabled={!canSubmit || mut.isPending}>
          {mut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          حفظ
        </Button>
      </div>
    </Dialog>
  );
}

function EditVillageBasePriceDialog({
  village,
  onClose,
}: {
  village: Village;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const initial = toNumberOrNull(village.baseDeliveryPrice ?? null);
  const [price, setPrice] = useState(initial === null ? '' : String(initial));
  const [nameAr, setNameAr] = useState<string>(village.nameAr ?? '');

  const mut = useMutation({
    mutationFn: async () => {
      const trimmed = price.trim();
      const body: Record<string, unknown> = { nameAr: nameAr.trim() };
      if (trimmed === '') {
        body.baseDeliveryPrice = null;
      } else {
        const n = Number(trimmed);
        if (!Number.isFinite(n) || n < 0) {
          throw new Error('السعر يجب أن يكون رقماً موجباً');
        }
        body.baseDeliveryPrice = n;
      }
      await api.raw.patch(`/admin/zones/villages/${village.id}`, body);
    },
    onSuccess: () => {
      toast.success('تم تحديث القرية');
      qc.invalidateQueries({ queryKey: ['admin', 'zones', 'villages', village.cityId] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="تعديل القرية" size="sm">
      <div className="space-y-3">
        <Field label="اسم القرية" required>
          <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} autoFocus />
        </Field>
        <Field label="السعر الأساسي (ج.م)" hint="اتركه فارغاً لإلغاء السعر الافتراضي">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
            autoFocus
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" size="md" onClick={onClose}>
          إلغاء
        </Button>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          حفظ
        </Button>
      </div>
    </Dialog>
  );
}
