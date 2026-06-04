/**
 * Home settings — admin-editable mobile home screen content.
 *
 * Single form that PATCHes the singleton HomeConfig row. Everything is
 * nullable so leaving a field blank means "use the app's default" rather
 * than "store empty string".
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Loader2, Save, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button.js';
import { Field, Input } from '../components/ui/Input.js';
import { CardSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';

interface HomeConfig {
  heroGreeting: string | null;
  heroSubtitle: string | null;
  heroGradient: string[] | null;
  trustStripTitle: string | null;
  trustStripSubtitle: string | null;
  promoBannerTitle: string | null;
  promoBannerCode: string | null;
  visibleServiceKeys: string[] | null;
  featuredMerchantIds: string[] | null;
  featuredOfferIds: string[] | null;
  showPromoBanner: boolean;
  showTrustStrip: boolean;
}

interface Service {
  id: string;
  key: string;
  nameAr: string;
  isActive: boolean;
}

interface Merchant {
  id: string;
  storeNameAr: string;
  rating?: number | null;
  isOpen?: boolean;
}

interface Offer {
  id: string;
  titleAr: string;
  code?: string | null;
}

export function HomeSettingsPage() {
  const qc = useQueryClient();

  const { data: cfg, isLoading } = useQuery({
    queryKey: ['admin', 'home-config'],
    queryFn: () => api.adminGetHomeConfig() as Promise<HomeConfig>,
  });

  const { data: services } = useQuery({
    queryKey: ['admin', 'services'],
    queryFn: () => api.adminListServices() as Promise<Service[]>,
  });

  const { data: merchantsPage } = useQuery({
    queryKey: ['admin', 'merchants', 'all'],
    queryFn: () => api.adminListMerchants({ pageSize: 100 }) as Promise<{ items: Merchant[] }>,
  });
  const merchants = merchantsPage?.items ?? [];

  const { data: offers } = useQuery({
    queryKey: ['admin', 'offers'],
    queryFn: () => api.adminListOffers() as Promise<Offer[]>,
  });

  // Local form state, hydrated from server when the query lands. We keep
  // state local (instead of binding to `cfg`) so the admin can edit freely
  // and only commit on Save.
  const [form, setForm] = useState<HomeConfig | null>(null);
  useEffect(() => {
    if (cfg && !form) setForm(cfg);
  }, [cfg, form]);

  const mutation = useMutation({
    mutationFn: (data: Partial<HomeConfig>) => api.adminUpdateHomeConfig(data),
    onSuccess: () => {
      toast.success('تم حفظ إعدادات الصفحة الرئيسية');
      qc.invalidateQueries({ queryKey: ['admin', 'home-config'] });
    },
    onError: (err: Error) => toast.error(err.message || 'فشل الحفظ'),
  });

  const reset = () => setForm(cfg ?? null);

  if (isLoading || !form) {
    return <CardSkeleton />;
  }

  // Helper to flip a value inside a string-array field (e.g. selected merchant IDs).
  const toggleInArray = (key: keyof HomeConfig, value: string) => {
    setForm((prev) => {
      if (!prev) return prev;
      const cur = (prev[key] as string[] | null) ?? [];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      return { ...prev, [key]: next.length ? next : null };
    });
  };

  const updateField = <K extends keyof HomeConfig>(key: K, value: HomeConfig[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const dirty = JSON.stringify(form) !== JSON.stringify(cfg);

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-brand-dark inline-flex items-center gap-2">
            <Smartphone className="w-6 h-6" />
            إعدادات الصفحة الرئيسية للتطبيق
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            تحكّم في النصوص والعروض والخدمات اللي بتظهر للعملاء في تطبيق الموبايل
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="md" onClick={reset} disabled={!dirty}>
            تراجع
          </Button>
          <Button
            size="md"
            disabled={!dirty || mutation.isPending}
            onClick={() => mutation.mutate(form)}
          >
            {mutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            حفظ التغييرات
          </Button>
        </div>
      </div>

      {/* ── Hero section ───────────────────────────────────────────── */}
      <Section
        title="الرأس (Hero)"
        subtitle="تحية المستخدم ونص جذاب يظهر بأعلى الشاشة. اتركه فارغ لاستخدام الافتراضي."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="نص التحية" hint='مثال: "أهلاً بك" أو "صباح الخير"'>
            <Input
              value={form.heroGreeting ?? ''}
              onChange={(e) => updateField('heroGreeting', e.target.value || null)}
              maxLength={120}
              placeholder="افتراضي: أهلاً {اسم المستخدم}"
            />
          </Field>
          <Field label="السطر الترويجي" hint="السطر اللي تحت التحية مباشرة">
            <Input
              value={form.heroSubtitle ?? ''}
              onChange={(e) => updateField('heroSubtitle', e.target.value || null)}
              maxLength={160}
              placeholder="افتراضي: ايه اللي محتاج توصيله النهارده؟"
            />
          </Field>
          <Field label="ألوان التدرج (Gradient)" hint="2-4 ألوان hex مفصولة بفاصلة">
            <Input
              value={(form.heroGradient ?? []).join(',')}
              onChange={(e) => {
                const parts = e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean);
                updateField('heroGradient', parts.length >= 2 ? parts : null);
              }}
              placeholder="افتراضي: #E0301E,#EC7A2C"
              dir="ltr"
            />
          </Field>
        </div>
        {form.heroGradient && form.heroGradient.length >= 2 && (
          <div className="mt-2">
            <div
              className="h-12 rounded-lg border border-border"
              style={{
                background: `linear-gradient(135deg, ${form.heroGradient.join(', ')})`,
              }}
            />
          </div>
        )}
      </Section>

      {/* ── Promo banner ───────────────────────────────────────────── */}
      <Section
        title="بانر العروض"
        subtitle="الكارت اللي يعرض كود الخصم"
        rightSlot={
          <Toggle
            value={form.showPromoBanner}
            onChange={(v) => updateField('showPromoBanner', v)}
            label={form.showPromoBanner ? 'مفعّل' : 'مخفي'}
          />
        }
      >
        {form.showPromoBanner && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="عنوان البانر">
              <Input
                value={form.promoBannerTitle ?? ''}
                onChange={(e) => updateField('promoBannerTitle', e.target.value || null)}
                maxLength={140}
                placeholder='مثال: "خصم 20% على أول طلب"'
              />
            </Field>
            <Field label="كود الخصم">
              <Input
                value={form.promoBannerCode ?? ''}
                onChange={(e) =>
                  updateField('promoBannerCode', (e.target.value || '').toUpperCase() || null)
                }
                maxLength={40}
                placeholder="مثال: TAMEM20"
                dir="ltr"
              />
            </Field>
          </div>
        )}
      </Section>

      {/* ── Trust strip ───────────────────────────────────────────── */}
      <Section
        title="شريط الثقة"
        subtitle="السطر اللي يظهر بأسفل الصفحة مع وعد التوصيل"
        rightSlot={
          <Toggle
            value={form.showTrustStrip}
            onChange={(v) => updateField('showTrustStrip', v)}
            label={form.showTrustStrip ? 'مفعّل' : 'مخفي'}
          />
        }
      >
        {form.showTrustStrip && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="العنوان">
              <Input
                value={form.trustStripTitle ?? ''}
                onChange={(e) => updateField('trustStripTitle', e.target.value || null)}
                maxLength={120}
                placeholder='مثال: "توصيل سريع خلال 30 دقيقة"'
              />
            </Field>
            <Field label="السطر الفرعي">
              <Input
                value={form.trustStripSubtitle ?? ''}
                onChange={(e) => updateField('trustStripSubtitle', e.target.value || null)}
                maxLength={160}
                placeholder='مثال: "داخل مدينة قفط — للطلبات القريبة"'
              />
            </Field>
          </div>
        )}
      </Section>

      {/* ── Visible services ───────────────────────────────────────── */}
      <Section
        title="الخدمات الظاهرة"
        subtitle="حدد الخدمات التي تظهر في شاشة الموبايل. اتركها فارغة لإظهار الكل."
      >
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {(services ?? []).map((s) => {
            const selected = form.visibleServiceKeys?.includes(s.key) ?? false;
            return (
              <CheckboxRow
                key={s.id}
                label={s.nameAr}
                hint={s.isActive ? 'متاحة' : 'مخفية في الخدمة'}
                checked={selected}
                onChange={() => toggleInArray('visibleServiceKeys', s.key)}
              />
            );
          })}
        </div>
        <ClearArrayHint
          empty={!form.visibleServiceKeys}
          onClear={() => updateField('visibleServiceKeys', null)}
          label="إظهار كل الخدمات (الافتراضي)"
        />
      </Section>

      {/* ── Featured merchants ───────────────────────────────────── */}
      <Section
        title="المتاجر المميزة"
        subtitle='المتاجر اللي تظهر في قائمة "متاجر قريبة منك". اتركها فارغة لاختيار أعلى تقييماً تلقائياً.'
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {merchants.map((m) => {
            const selected = form.featuredMerchantIds?.includes(m.id) ?? false;
            return (
              <CheckboxRow
                key={m.id}
                label={m.storeNameAr}
                hint={`${m.rating ? `★ ${Number(m.rating).toFixed(1)}` : '—'} · ${
                  m.isOpen ? 'مفتوح' : 'مغلق'
                }`}
                checked={selected}
                onChange={() => toggleInArray('featuredMerchantIds', m.id)}
              />
            );
          })}
        </div>
        <ClearArrayHint
          empty={!form.featuredMerchantIds}
          onClear={() => updateField('featuredMerchantIds', null)}
          label="اختيار تلقائي (أعلى تقييماً)"
        />
      </Section>

      {/* ── Featured offers ─────────────────────────────────────── */}
      <Section
        title="العروض المميزة"
        subtitle="العرض اللي يظهر في البانر. اتركها فارغة لاستخدام أحدث عرض."
      >
        <div className="space-y-2">
          {(offers ?? []).map((o) => {
            const selected = form.featuredOfferIds?.includes(o.id) ?? false;
            return (
              <CheckboxRow
                key={o.id}
                label={o.titleAr}
                hint={o.code ? `كود: ${o.code}` : 'بدون كود'}
                checked={selected}
                onChange={() => toggleInArray('featuredOfferIds', o.id)}
              />
            );
          })}
          {(!offers || offers.length === 0) && (
            <p className="text-sm text-muted-foreground bg-muted rounded p-3">
              مفيش عروض مضافة. أضف من قسم العروض أولاً.
            </p>
          )}
        </div>
        <ClearArrayHint
          empty={!form.featuredOfferIds}
          onClear={() => updateField('featuredOfferIds', null)}
          label="استخدام أحدث عرض (الافتراضي)"
        />
      </Section>

      {/* Sticky save bar for long pages */}
      {dirty && (
        <div className="sticky bottom-4 bg-white border border-brand-red shadow-lg rounded-xl p-3 flex items-center justify-between">
          <span className="text-sm font-bold text-brand-red">⚠ في تغييرات غير محفوظة</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={reset}>
              تراجع
            </Button>
            <Button size="sm" onClick={() => mutation.mutate(form)} disabled={mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Save className="w-3 h-3" />
              )}
              حفظ
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  rightSlot,
  children,
}: {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-border p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-brand-dark">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        {rightSlot}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition ${
        value
          ? 'bg-green-100 text-green-700 hover:bg-green-200'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {value ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
      {label}
    </button>
  );
}

function CheckboxRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition ${
        checked
          ? 'border-brand-red bg-brand-red/5'
          : 'border-border hover:border-brand-red/40 hover:bg-muted/30'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="w-4 h-4 accent-brand-red"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold truncate">{label}</div>
        {hint && <div className="text-xs text-muted-foreground truncate">{hint}</div>}
      </div>
    </label>
  );
}

function ClearArrayHint({
  empty,
  onClear,
  label,
}: {
  empty: boolean;
  onClear: () => void;
  label: string;
}) {
  return (
    <div className="text-xs text-muted-foreground mt-2 flex items-center justify-between">
      <span>{empty ? `✓ ${label}` : 'تم تحديد عناصر مخصصة'}</span>
      {!empty && (
        <button type="button" onClick={onClear} className="text-brand-red hover:underline">
          مسح التحديد
        </button>
      )}
    </div>
  );
}
