/**
 * Home settings — admin-editable mobile home screen content.
 *
 * Simplified layout: tabs split the form into focused sections so the page
 * doesn't feel like a 6-row config dump. Save lives in the header (no
 * sticky-bottom bar). Promo banner is wired to the Coupons table — admin
 * picks an existing coupon instead of free-typing a title/code.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Eye,
  EyeOff,
  Gift,
  Loader2,
  Palette,
  Save,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  promoBannerCouponId: string | null;
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

interface Coupon {
  id: string;
  code: string;
  type: 'PERCENTAGE' | 'FLAT';
  value: number | string;
  description?: string | null;
  isActive: boolean;
  validTo?: string | null;
  minOrderAmount?: number | string | null;
  maxDiscount?: number | string | null;
}

type TabKey = 'hero' | 'promo' | 'services' | 'merchants' | 'trust';

const TABS: { key: TabKey; label: string; Icon: typeof Smartphone }[] = [
  { key: 'hero', label: 'الرأس', Icon: Palette },
  { key: 'promo', label: 'بانر العروض', Icon: Gift },
  { key: 'services', label: 'الخدمات', Icon: Sparkles },
  { key: 'merchants', label: 'المتاجر', Icon: Store },
  { key: 'trust', label: 'شريط الثقة', Icon: ShieldCheck },
];

// ────────────────────────────────────────────────────────────────────────────

export function HomeSettingsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('hero');

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

  const { data: coupons } = useQuery({
    queryKey: ['admin', 'coupons'],
    queryFn: () => api.adminListCoupons() as Promise<Coupon[]>,
  });

  const [form, setForm] = useState<HomeConfig | null>(null);
  useEffect(() => {
    if (cfg && !form) setForm(cfg);
  }, [cfg, form]);

  const mutation = useMutation({
    mutationFn: (data: Partial<HomeConfig>) => api.adminUpdateHomeConfig(data),
    onSuccess: () => {
      toast.success('تم حفظ الإعدادات');
      qc.invalidateQueries({ queryKey: ['admin', 'home-config'] });
    },
    onError: (err: Error) => toast.error(err.message || 'فشل الحفظ'),
  });

  if (isLoading || !form) {
    return <CardSkeleton />;
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(cfg);

  const toggleInArray = (key: keyof HomeConfig, value: string) => {
    setForm((prev) => {
      if (!prev) return prev;
      const cur = (prev[key] as string[] | null) ?? [];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      return { ...prev, [key]: next.length ? next : null };
    });
  };

  const update = <K extends keyof HomeConfig>(key: K, value: HomeConfig[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-brand-dark inline-flex items-center gap-2">
            <Smartphone className="w-6 h-6" />
            صفحة التطبيق
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            تحكّم في النصوص والعروض والخدمات اللي بتظهر للعملاء
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="text-xs bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full font-bold">
              ⚠ تغييرات غير محفوظة
            </span>
          )}
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
            حفظ
          </Button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="bg-white rounded-xl border border-border p-1 inline-flex flex-wrap gap-1">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition ${
                active ? 'bg-brand-red text-white' : 'text-brand-dark hover:bg-muted'
              }`}
            >
              <t.Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === 'hero' && <HeroTab form={form} update={update} />}
      {tab === 'promo' && (
        <PromoTab
          form={form}
          update={update}
          coupons={coupons ?? []}
          onCreateCoupon={() => navigate('/coupons')}
        />
      )}
      {tab === 'services' && (
        <ServicesTab
          form={form}
          services={services ?? []}
          onToggle={(key) => toggleInArray('visibleServiceKeys', key)}
          onClear={() => update('visibleServiceKeys', null)}
        />
      )}
      {tab === 'merchants' && (
        <MerchantsTab
          form={form}
          merchants={merchants}
          onToggle={(id) => toggleInArray('featuredMerchantIds', id)}
          onClear={() => update('featuredMerchantIds', null)}
        />
      )}
      {tab === 'trust' && <TrustTab form={form} update={update} />}
    </div>
  );
}

// ── Tab: Hero ────────────────────────────────────────────────────────────

function HeroTab({
  form,
  update,
}: {
  form: HomeConfig;
  update: <K extends keyof HomeConfig>(key: K, value: HomeConfig[K]) => void;
}) {
  const gradient = form.heroGradient ?? ['#E0301E', '#EC7A2C'];
  return (
    <SectionCard hint="السطرين اللي بيظهروا أعلى الصفحة الرئيسية ولون الخلفية.">
      <Field label="التحية" hint="مثال: «أهلاً بك» — اتركها فارغة لاستخدام «أهلاً {اسم}» الافتراضي">
        <Input
          value={form.heroGreeting ?? ''}
          onChange={(e) => update('heroGreeting', e.target.value || null)}
          maxLength={120}
          placeholder="أهلاً بك"
        />
      </Field>
      <Field label="السطر الترويجي" hint="السطر اللي تحت التحية مباشرة">
        <Input
          value={form.heroSubtitle ?? ''}
          onChange={(e) => update('heroSubtitle', e.target.value || null)}
          maxLength={160}
          placeholder="ايه اللي محتاج توصيله النهارده؟"
        />
      </Field>

      {/* Gradient preset chips — way easier than typing hex codes */}
      <div>
        <div className="text-sm font-bold mb-2">لون الخلفية</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {GRADIENT_PRESETS.map((p) => {
            const selected = JSON.stringify(form.heroGradient) === JSON.stringify(p.colors);
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => update('heroGradient', selected ? null : (p.colors as string[]))}
                className={`relative rounded-lg overflow-hidden border-2 transition ${
                  selected ? 'border-brand-red' : 'border-transparent hover:border-border'
                }`}
              >
                <div
                  className="h-16"
                  style={{ background: `linear-gradient(135deg, ${p.colors.join(', ')})` }}
                />
                <div className="bg-white text-xs font-bold py-1.5">{p.label}</div>
              </button>
            );
          })}
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          {form.heroGradient ? '✓ لون مخصص' : '✓ اللون الافتراضي (أحمر برتقالي)'}
        </div>
      </div>

      {/* Preview */}
      <div className="rounded-xl overflow-hidden border border-border">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold p-2 bg-muted/30">
          معاينة
        </div>
        <div
          className="p-5 text-white"
          style={{ background: `linear-gradient(135deg, ${gradient.join(', ')})` }}
        >
          <div className="text-xs opacity-85">التوصيل إلى — اضغط لتغيير العنوان</div>
          <div className="text-xl font-black mt-3">{form.heroGreeting ?? 'أهلاً أحمد 👋'}</div>
          <div className="text-sm opacity-85 mt-1">
            {form.heroSubtitle ?? 'ايه اللي محتاج توصيله النهارده؟'}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

const GRADIENT_PRESETS = [
  { label: 'الافتراضي', colors: ['#E0301E', '#EC7A2C'] },
  { label: 'ذهبي', colors: ['#F2A93B', '#EC7A2C'] },
  { label: 'بنفسجي', colors: ['#8B5CF6', '#E0301E'] },
  { label: 'أزرق', colors: ['#0EA5E9', '#0369A1'] },
  { label: 'أخضر', colors: ['#1A9F6E', '#157A52'] },
  { label: 'داكن', colors: ['#241310', '#3B1E16'] },
];

// ── Tab: Promo ───────────────────────────────────────────────────────────

function PromoTab({
  form,
  update,
  coupons,
  onCreateCoupon,
}: {
  form: HomeConfig;
  update: <K extends keyof HomeConfig>(key: K, value: HomeConfig[K]) => void;
  coupons: Coupon[];
  onCreateCoupon: () => void;
}) {
  const activeCoupons = coupons.filter((c) => c.isActive);
  const selectedCoupon = activeCoupons.find((c) => c.id === form.promoBannerCouponId);

  return (
    <SectionCard
      hint="الكارت الأصفر اللي بيظهر تحت قائمة الخدمات. مرتبط بكوبون موجود."
      rightSlot={
        <Toggle value={form.showPromoBanner} onChange={(v) => update('showPromoBanner', v)} />
      }
    >
      {!form.showPromoBanner ? (
        <p className="text-sm text-muted-foreground bg-muted rounded-lg p-3 text-center">
          البانر مخفي. شغّله من الزر بالأعلى لتعديل المحتوى.
        </p>
      ) : (
        <>
          <div>
            <div className="text-sm font-bold mb-2">اختر الكوبون</div>

            {activeCoupons.length === 0 ? (
              <div className="bg-muted rounded-lg p-4 text-center space-y-2">
                <p className="text-sm text-muted-foreground">مفيش كوبونات مفعّلة دلوقتي</p>
                <Button size="sm" onClick={onCreateCoupon}>
                  + إنشاء كوبون جديد
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-72 overflow-y-auto">
                <CouponOption
                  selected={!form.promoBannerCouponId}
                  onSelect={() => update('promoBannerCouponId', null)}
                  label="بدون كوبون"
                  hint="اخفي البانر أو استخدم النص الحر"
                  muted
                />
                {activeCoupons.map((c) => (
                  <CouponOption
                    key={c.id}
                    selected={c.id === form.promoBannerCouponId}
                    onSelect={() => update('promoBannerCouponId', c.id)}
                    label={c.code}
                    hint={summarizeCoupon(c)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Optional override title — only when no coupon picked */}
          {!form.promoBannerCouponId && (
            <Field
              label="عنوان البانر (اختياري)"
              hint="استخدمه لو عاوز عرض غير كوبون — مثل بانر للتطبيق نفسه"
            >
              <Input
                value={form.promoBannerTitle ?? ''}
                onChange={(e) => update('promoBannerTitle', e.target.value || null)}
                maxLength={140}
                placeholder='مثال: "حمّل التطبيق وخد خصم"'
              />
            </Field>
          )}

          {/* Live preview */}
          <div className="rounded-xl overflow-hidden border border-border">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold p-2 bg-muted/30">
              معاينة
            </div>
            <div className="p-3">
              <PromoPreview couponSelected={selectedCoupon} fallbackTitle={form.promoBannerTitle} />
            </div>
          </div>
        </>
      )}
    </SectionCard>
  );
}

function summarizeCoupon(c: Coupon): string {
  const val = Number(c.value);
  const valueStr = c.type === 'PERCENTAGE' ? `${val}%` : `${val} ج.م`;
  const minOrder = c.minOrderAmount ? ` · حد أدنى ${Number(c.minOrderAmount)} ج.م` : '';
  return `خصم ${valueStr}${minOrder}`;
}

function CouponOption({
  selected,
  onSelect,
  label,
  hint,
  muted,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  hint: string;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-right p-3 rounded-lg border transition ${
        selected
          ? 'border-brand-red bg-brand-red/5'
          : 'border-border hover:border-brand-red/40 hover:bg-muted/30'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className={`font-mono font-bold ${muted ? 'text-muted-foreground' : ''}`}>{label}</div>
        {selected && <div className="text-brand-red text-xs font-bold">✓</div>}
      </div>
      <div className="text-xs text-muted-foreground mt-1">{hint}</div>
    </button>
  );
}

function PromoPreview({
  couponSelected,
  fallbackTitle,
}: {
  couponSelected?: Coupon;
  fallbackTitle: string | null;
}) {
  const title = couponSelected?.description
    ? couponSelected.description
    : couponSelected
      ? summarizeCoupon(couponSelected)
      : (fallbackTitle ?? 'استخدم الكوبون للحصول على خصم');
  const code = couponSelected?.code ?? 'TAMEM20';
  return (
    <div className="rounded-xl bg-gradient-to-br from-[#241310] to-[#3B1E16] p-4 text-white flex items-center gap-3">
      <div className="w-12 h-12 rounded-lg bg-white/10 grid place-items-center">
        <Gift className="w-6 h-6 text-[#F2A93B]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate">{title}</div>
        <div className="text-xs opacity-85 mt-0.5">
          كود الخصم: <span className="text-[#F2A93B] font-mono font-bold">{code}</span>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Services ───────────────────────────────────────────────────────

function ServicesTab({
  form,
  services,
  onToggle,
  onClear,
}: {
  form: HomeConfig;
  services: Service[];
  onToggle: (key: string) => void;
  onClear: () => void;
}) {
  const allSelected = !form.visibleServiceKeys;
  return (
    <SectionCard hint="حدد الخدمات اللي تظهر في تطبيق العميل. اتركها كلها لإظهار الكل.">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {allSelected
            ? '✓ كل الخدمات تظهر (الافتراضي)'
            : `محدد ${form.visibleServiceKeys?.length}/${services.length}`}
        </span>
        {!allSelected && (
          <button onClick={onClear} className="text-xs text-brand-red hover:underline">
            إظهار الكل
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {services.map((s) => {
          // visibleServiceKeys === null means "show every service" — paint
          // every checkbox as ticked so the UI matches the badge above
          // ("✓ كل الخدمات تظهر"). The first untick will switch the field
          // to an explicit array (handled by the parent's toggleInArray).
          const selected =
            form.visibleServiceKeys === null ? true : form.visibleServiceKeys.includes(s.key);
          return (
            <CheckRow
              key={s.id}
              label={s.nameAr}
              hint={s.isActive ? '✓ نشطة' : '⚠ غير نشطة في إعدادات الخدمات'}
              checked={selected}
              onChange={() => onToggle(s.key)}
            />
          );
        })}
      </div>
    </SectionCard>
  );
}

// ── Tab: Merchants ──────────────────────────────────────────────────────

function MerchantsTab({
  form,
  merchants,
  onToggle,
  onClear,
}: {
  form: HomeConfig;
  merchants: Merchant[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  const auto = !form.featuredMerchantIds;
  return (
    <SectionCard hint='المتاجر اللي تظهر في قائمة "متاجر قريبة منك". اتركها فارغة لاختيار أعلى تقييماً تلقائياً.'>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {auto
            ? '✓ اختيار تلقائي (أعلى 4 تقييماً)'
            : `محدد ${form.featuredMerchantIds?.length} متجر`}
        </span>
        {!auto && (
          <button onClick={onClear} className="text-xs text-brand-red hover:underline">
            اختيار تلقائي
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto">
        {merchants.map((m) => {
          const selected = form.featuredMerchantIds?.includes(m.id) ?? false;
          return (
            <CheckRow
              key={m.id}
              label={m.storeNameAr}
              hint={`${m.rating ? `★ ${Number(m.rating).toFixed(1)}` : '—'} · ${m.isOpen ? 'مفتوح' : 'مغلق'}`}
              checked={selected}
              onChange={() => onToggle(m.id)}
            />
          );
        })}
      </div>
    </SectionCard>
  );
}

// ── Tab: Trust strip ────────────────────────────────────────────────────

function TrustTab({
  form,
  update,
}: {
  form: HomeConfig;
  update: <K extends keyof HomeConfig>(key: K, value: HomeConfig[K]) => void;
}) {
  return (
    <SectionCard
      hint="الكارت اللي بيظهر بأسفل الصفحة مع وعد التوصيل السريع."
      rightSlot={
        <Toggle value={form.showTrustStrip} onChange={(v) => update('showTrustStrip', v)} />
      }
    >
      {!form.showTrustStrip ? (
        <p className="text-sm text-muted-foreground bg-muted rounded-lg p-3 text-center">
          الشريط مخفي
        </p>
      ) : (
        <>
          <Field label="العنوان">
            <Input
              value={form.trustStripTitle ?? ''}
              onChange={(e) => update('trustStripTitle', e.target.value || null)}
              maxLength={120}
              placeholder="توصيل سريع خلال 30 دقيقة"
            />
          </Field>
          <Field label="السطر الفرعي">
            <Input
              value={form.trustStripSubtitle ?? ''}
              onChange={(e) => update('trustStripSubtitle', e.target.value || null)}
              maxLength={160}
              placeholder="داخل مدينة قفط — للطلبات القريبة"
            />
          </Field>
        </>
      )}
    </SectionCard>
  );
}

// ── Shared bits ─────────────────────────────────────────────────────────

function SectionCard({
  children,
  hint,
  rightSlot,
}: {
  children: React.ReactNode;
  hint?: string;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-border p-5 space-y-4">
      {(hint || rightSlot) && (
        <div className="flex items-start justify-between gap-3 -mt-1">
          {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
          {rightSlot}
        </div>
      )}
      {children}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
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
      {value ? 'مفعّل' : 'مخفي'}
    </button>
  );
}

function CheckRow({
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
