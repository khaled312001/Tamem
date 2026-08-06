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
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Gift,
  Images,
  ListOrdered,
  Package,
  Search,
  Loader2,
  Palette,
  RotateCcw,
  Save,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button.js';
import { Field, Input } from '../components/ui/Input.js';
import { CardSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';
import { uploadFile } from '../lib/uploadFile.js';

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
  featuredProductIds: string[] | null;
  showPromoBanner: boolean;
  showTrustStrip: boolean;
  sectionLayout: SectionItem[] | null;
  serviceCards: Record<string, ServiceCardOverride> | null;
  spotlightCity: string | null;
  intercityCity: string | null;
}

/** Admin override for one headline service card. Every field is optional; an
 *  empty one falls back to the copy and artwork bundled in the app. */
interface ServiceCardOverride {
  title?: string | null;
  subtitle?: string | null;
  imageUrl?: string | null;
}

/** The three cards the app draws, with the built-in copy shown as placeholder
 *  text so the admin can see what they are replacing. MUST match the mobile
 *  SERVICE_CARD_COPY keys. */
const SERVICE_CARDS: {
  key: string;
  label: string;
  title: string;
  subtitle: string;
  /** Copy of the artwork the app ships, served from the dashboard's own public
   *  folder. Showing a grey "الصورة الأصلية" box instead was the whole problem:
   *  the admin could not see what they were about to replace. */
  art: string;
}[] = [
  {
    key: 'delivery',
    label: 'دليفري',
    title: 'دليفري',
    subtitle: 'داخل المدينة',
    art: '/super_admin/app-art/service-delivery.jpg',
  },
  {
    key: 'shipping',
    label: 'شحن',
    title: 'شحن',
    subtitle: 'بين المناطق',
    art: '/super_admin/app-art/service-shipping.jpg',
  },
  {
    key: 'merchant',
    label: 'تاجر',
    title: 'تاجر',
    subtitle: 'طلبات جملة',
    art: '/super_admin/app-art/service-merchant.jpg',
  },
];

/** The card is drawn at a fixed 1.12:1 box and the image is cropped to fill it,
 *  so the three tiles stay identical whatever gets uploaded. Telling the admin
 *  the ratio is what stops them uploading something that crops badly. */
const SERVICE_ART_HINT = 'مقاس مثالي 560×500 بكسل (نسبة 1.12:1) — الصورة بتتقص للمقاس ده';

/**
 * The copy the APP itself draws when a field has never been overridden. Kept
 * here so the editor can show the live text instead of an empty box — a blank
 * field never told the admin what the customer was actually reading.
 *
 * MUST match the mobile fallbacks (HomeHeader / TrustStrip / CouponBanner).
 */
const APP_DEFAULTS = {
  heroGreeting: 'أهلاً بك',
  heroSubtitle: 'ايه اللي محتاج توصيله النهارده؟',
  trustStripTitle: 'توصيل سريع خلال 30 دقيقة',
  trustStripSubtitle: 'داخل مدينة قفط — للطلبات القريبة',
  promoBannerTitle: 'خصم على أول طلب',
} as const;

/** One home section's order slot. Mirrors the mobile HomeSectionConfig. */
interface SectionItem {
  key: string;
  visible: boolean;
  title?: string | null;
}

/**
 * The reorderable/hideable home sections — MUST stay in sync (keys + order) with
 * the mobile DEFAULT_HOME_SECTIONS in apps/mobile/.../home/homeData.ts. Only the
 * two product rails carry an editable title; the rest own their headers.
 */
const HOME_SECTIONS: {
  key: string;
  label: string;
  hint?: string;
  renamable?: boolean;
  defaultTitle?: string;
}[] = [
  {
    key: 'spotlightRestaurants',
    label: 'واجهة المطاعم',
    hint: 'الرَّف الكبير اللي بيفتح الشاشة — مطاعم المدينة بصورها',
    renamable: true,
    defaultTitle: 'مطاعم قنا',
  },
  { key: 'services', label: 'الخدمات الرئيسية', hint: 'دليفري · شحن · تاجر' },
  {
    key: 'intercityRestaurants',
    label: 'مطاعم من مدينة تانية',
    hint: 'مطاعم بره المدينة بتوصّل لهنا — يظهر بس لما تحدد المدينة',
    renamable: true,
    defaultTitle: 'من قنا لحد باب بيتك',
  },
  { key: 'offersSlider', label: 'سلايدر العروض', hint: 'يظهر فقط لو فيه شرائح' },
  { key: 'categories', label: 'التصنيفات', hint: 'مطاعم · صيدليات …' },
  { key: 'productSections', label: 'أقسام المنتجات', hint: 'بيتزا · كريب …' },
  {
    key: 'featuredProducts',
    label: 'الأكثر طلباً',
    hint: 'يظهر فقط لو اخترت منتجات',
    renamable: true,
    defaultTitle: 'الأكثر طلباً',
  },
  {
    key: 'deals',
    label: 'عروض اليوم',
    hint: 'يظهر تلقائياً لو فيه خصومات',
    renamable: true,
    defaultTitle: 'عروض اليوم',
  },
  { key: 'popularStores', label: 'متاجر مميزة', hint: 'الرَّف الأفقي للمتاجر' },
  { key: 'nearbyStores', label: 'متاجر قريبة منك', hint: 'القائمة الرأسية' },
  { key: 'promoCards', label: 'بطاقات (تتبع الطلب / توصيل سريع)' },
  { key: 'trustStrip', label: 'شريط الثقة', hint: 'يتحكم في إظهاره تبويب «شريط الثقة» أيضاً' },
  { key: 'quickActions', label: 'اختصارات (محفظة · كوبونات · مفضلة)' },
];

/** Merge a saved layout over the canonical list: keep configured order, and slot
 *  any new section the saved layout predates in at its canonical position (NOT
 *  at the end — a section meant to open the screen would otherwise arrive
 *  buried). Mirrors the mobile resolver exactly. */
function resolveLayout(saved: SectionItem[] | null | undefined): SectionItem[] {
  const known = new Set(HOME_SECTIONS.map((s) => s.key));
  if (!Array.isArray(saved) || saved.length === 0) {
    return HOME_SECTIONS.map((s) => ({ key: s.key, visible: true, title: s.defaultTitle ?? null }));
  }
  const seen = new Set<string>();
  const out: SectionItem[] = [];
  for (const it of saved) {
    if (!it || !known.has(it.key) || seen.has(it.key)) continue;
    seen.add(it.key);
    out.push({ key: it.key, visible: it.visible !== false, title: it.title ?? null });
  }
  HOME_SECTIONS.forEach((s, i) => {
    if (seen.has(s.key)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const prev = HOME_SECTIONS[j];
      if (!prev) continue;
      const idx = out.findIndex((o) => o.key === prev.key);
      if (idx !== -1) {
        at = idx + 1;
        break;
      }
    }
    out.splice(at, 0, { key: s.key, visible: true, title: s.defaultTitle ?? null });
    seen.add(s.key);
  });
  return out;
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
  /** Where the STORE is — drives which restaurant rail it appears in. */
  city?: string | null;
  logoUrl?: string | null;
  coverUrl?: string | null;
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

type TabKey =
  | 'layout'
  | 'hero'
  | 'slider'
  | 'promo'
  | 'services'
  | 'merchants'
  | 'products'
  | 'trust';

const TABS: { key: TabKey; label: string; Icon: typeof Smartphone }[] = [
  { key: 'layout', label: 'ترتيب الأقسام', Icon: ListOrdered },
  { key: 'hero', label: 'الرأس', Icon: Palette },
  { key: 'slider', label: 'سلايدر العروض', Icon: Images },
  { key: 'promo', label: 'بانر العروض', Icon: Gift },
  { key: 'services', label: 'الخدمات', Icon: Sparkles },
  { key: 'merchants', label: 'المتاجر', Icon: Store },
  { key: 'products', label: 'الأكثر طلباً', Icon: Package },
  { key: 'trust', label: 'شريط الثقة', Icon: ShieldCheck },
];

// ────────────────────────────────────────────────────────────────────────────

export function HomeSettingsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('layout');

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
  // Offered as suggestions for the two rail-city fields. Derived from the real
  // records so a rail can only ever be pointed at a city that has stores.
  const cities = useMemo(
    () =>
      Array.from(new Set(merchants.map((m) => (m.city ?? '').trim()).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b, 'ar'),
      ),
    [merchants],
  );

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

  /** Patch one service card, dropping any field the admin blanked so it falls
   *  back to the app's own copy instead of saving an empty string. */
  const setServiceCard = (key: string, patch: ServiceCardOverride) => {
    setForm((prev) => {
      if (!prev) return prev;
      const merged: ServiceCardOverride = { ...(prev.serviceCards?.[key] ?? {}), ...patch };
      const cleaned: ServiceCardOverride = {};
      for (const [k, v] of Object.entries(merged)) {
        const s = typeof v === 'string' ? v.trim() : v;
        if (s) cleaned[k as keyof ServiceCardOverride] = s as string;
      }
      const next = { ...(prev.serviceCards ?? {}) };
      if (Object.keys(cleaned).length) next[key] = cleaned;
      else delete next[key];
      return { ...prev, serviceCards: Object.keys(next).length ? next : null };
    });
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
      {tab === 'layout' && <LayoutTab form={form} update={update} />}
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
          cities={cities}
          onToggle={(key) => toggleInArray('visibleServiceKeys', key)}
          onClear={() => update('visibleServiceKeys', null)}
          onSetCard={setServiceCard}
          update={update}
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
      {tab === 'products' && (
        <FeaturedProductsTab
          selected={form.featuredProductIds ?? []}
          onChange={(ids) => update('featuredProductIds', ids.length ? ids : null)}
        />
      )}
      {tab === 'slider' && <SliderTab />}
      {tab === 'trust' && <TrustTab form={form} update={update} />}
    </div>
  );
}

// ── Tab: Layout (section order + visibility + rename) ────────────────────

function LayoutTab({
  form,
  update,
}: {
  form: HomeConfig;
  update: <K extends keyof HomeConfig>(key: K, value: HomeConfig[K]) => void;
}) {
  const items = resolveLayout(form.sectionLayout);
  const metaOf = (key: string) => HOME_SECTIONS.find((s) => s.key === key);
  const visibleCount = items.filter((s) => s.visible).length;

  const commit = (next: SectionItem[]) => update('sectionLayout', next);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    const tmp = next[i]!;
    next[i] = next[j]!;
    next[j] = tmp;
    commit(next);
  };
  const setAt = (i: number, patch: Partial<SectionItem>) => {
    const next = items.slice();
    next[i] = { ...next[i]!, ...patch };
    commit(next);
  };

  return (
    <SectionCard
      hint="رتّب أقسام الصفحة الرئيسية، أظهِر/أخفِ أي قسم، وأعِد تسمية رفوف المنتجات. الترتيب من أعلى لأسفل — لا تنسَ الحفظ."
      rightSlot={
        form.sectionLayout ? (
          <button
            onClick={() => update('sectionLayout', null)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-red hover:underline"
            title="العودة للترتيب الافتراضي"
          >
            <RotateCcw className="w-3.5 h-3.5" /> الترتيب الافتراضي
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">الترتيب الافتراضي مطبّق</span>
        )
      }
    >
      <div className="text-xs text-muted-foreground -mt-2">
        {visibleCount} من {items.length} أقسام ظاهرة
      </div>

      <div className="space-y-2">
        {items.map((s, i) => {
          const meta = metaOf(s.key);
          return (
            <div
              key={s.key}
              className={`rounded-xl border p-3 transition ${
                s.visible ? 'border-border bg-card' : 'border-dashed border-border bg-muted/40'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
                    title="تحريك لأعلى"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === items.length - 1}
                    className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
                    title="تحريك لأسفل"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid place-items-center w-7 h-7 rounded-lg bg-muted text-xs font-black text-muted-foreground shrink-0">
                  {i + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <div className={`font-bold truncate ${s.visible ? '' : 'text-muted-foreground'}`}>
                    {meta?.label ?? s.key}
                  </div>
                  {meta?.hint && (
                    <div className="text-xs text-muted-foreground truncate">{meta.hint}</div>
                  )}
                </div>

                <Toggle value={s.visible} onChange={(v) => setAt(i, { visible: v })} />
              </div>

              {meta?.renamable && s.visible && (
                <div className="mt-2 ps-16">
                  <Field label="عنوان الرَّف">
                    <Input
                      value={s.title ?? ''}
                      onChange={(e) => setAt(i, { title: e.target.value || null })}
                      placeholder={meta.defaultTitle}
                      maxLength={60}
                    />
                  </Field>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
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
      <DefaultableField
        label="التحية"
        hint="لو سيبتها الأصلية بيظهر «أهلاً {اسم العميل}»"
        value={form.heroGreeting}
        fallback={APP_DEFAULTS.heroGreeting}
        onChange={(v) => update('heroGreeting', v)}
        maxLength={120}
      />
      <DefaultableField
        label="السطر الترويجي"
        hint="السطر اللي تحت التحية مباشرة"
        value={form.heroSubtitle}
        fallback={APP_DEFAULTS.heroSubtitle}
        onChange={(v) => update('heroSubtitle', v)}
        maxLength={160}
      />

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
  cities,
  onToggle,
  onClear,
  onSetCard,
  update,
}: {
  form: HomeConfig;
  services: Service[];
  /** Cities that actually appear on merchant records — typing one by hand that
   *  no store uses would silently produce an empty rail. */
  cities: string[];
  onToggle: (key: string) => void;
  onClear: () => void;
  onSetCard: (key: string, patch: ServiceCardOverride) => void;
  update: <K extends keyof HomeConfig>(key: K, value: HomeConfig[K]) => void;
}) {
  const allSelected = !form.visibleServiceKeys;
  return (
    <>
      <SectionCard hint="رفّي المطاعم اللي بتظهر في أول الشاشة. الرَّف الأول للمطاعم المحلية، والتاني لمطاعم مدينة تانية بتوصّل لهنا — اكتب اسم المدينة زي ما هي مكتوبة في بيانات المتجر بالظبط.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="مدينة رَف المطاعم الأول" hint="سيبها فاضية عشان يعرض مطاعم كل المدن">
            <Input
              value={form.spotlightCity ?? ''}
              onChange={(e) => update('spotlightCity', e.target.value.trim() || null)}
              placeholder="كل المدن"
              list="home-cities"
            />
          </Field>
          <Field
            label="مدينة رَف «مطاعم من مدينة تانية»"
            hint="سيبها فاضية عشان يختفي الرَّف ده خالص"
          >
            <Input
              value={form.intercityCity ?? ''}
              onChange={(e) => update('intercityCity', e.target.value.trim() || null)}
              placeholder="مثال: قنا"
              list="home-cities"
            />
          </Field>
        </div>
        <datalist id="home-cities">
          {cities.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <p className="text-xs text-muted-foreground leading-relaxed">
          المدن الموجودة فعلاً في بيانات المتاجر: {cities.length ? cities.join(' · ') : '—'}. عشان
          تضيف مطعم في قنا، افتح «التجار › إضافة تاجر» وحط المدينة «قنا».
        </p>
      </SectionCard>

      <SectionCard
        hint={`عدّل صورة وعنوان كل كارت من الكروت الثلاثة اللي بتفتح بيها الشاشة الرئيسية. سيب الحقل فاضي عشان يرجع للأصلي. ${SERVICE_ART_HINT}.`}
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {SERVICE_CARDS.map((c) => (
            <ServiceCardEditor
              key={c.key}
              def={c}
              value={form.serviceCards?.[c.key] ?? {}}
              onChange={(patch) => onSetCard(c.key, patch)}
            />
          ))}
        </div>
      </SectionCard>

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
    </>
  );
}

/**
 * One service card's overrides. The preview is drawn at the app's real aspect
 * ratio with the same crop, so what the admin sees here is what the phone
 * renders — an image that crops badly is visible before it ships.
 */
function ServiceCardEditor({
  def,
  value,
  onChange,
}: {
  def: (typeof SERVICE_CARDS)[number];
  value: ServiceCardOverride;
  onChange: (patch: ServiceCardOverride) => void;
}) {
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const { url } = await uploadFile(file);
      onChange({ imageUrl: url });
      toast.success(`تم رفع صورة «${def.label}»`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذّر رفع الصورة');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-foreground">{def.label}</span>
        {!!value.imageUrl && (
          <button
            type="button"
            onClick={() => onChange({ imageUrl: null })}
            className="text-xs text-brand-red hover:underline"
          >
            رجّع الصورة الأصلية
          </button>
        )}
      </div>

      <label className="block cursor-pointer">
        <div className="relative w-full overflow-hidden rounded-lg border border-dashed border-border bg-muted/40 aspect-[1.12/1]">
          {value.imageUrl ? (
            <img
              src={value.imageUrl}
              alt={def.label}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <>
              <img
                src={def.art}
                alt={def.label}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <span className="absolute bottom-1 start-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                الصورة الأصلية
              </span>
            </>
          )}
          {busy && (
            <div className="absolute inset-0 grid place-items-center bg-black/40 text-xs font-bold text-white">
              جاري الرفع…
            </div>
          )}
        </div>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </label>

      <input
        value={value.title ?? ''}
        onChange={(e) => onChange({ title: e.target.value })}
        placeholder={def.title}
        className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:border-brand-red"
      />
      <input
        value={value.subtitle ?? ''}
        onChange={(e) => onChange({ subtitle: e.target.value })}
        placeholder={def.subtitle}
        className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:border-brand-red"
      />
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        العنوان والوصف بيظهروا بس لو مفيش صورة — الصور الحالية العنوان مرسوم جواها.
      </p>
    </div>
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
              hint={`${m.rating ? `★ ${Number(m.rating).toFixed(1)}` : '—'} · ${m.isOpen ? 'مفتوح' : 'مغلق'}${m.city ? ` · ${m.city}` : ''}`}
              imageUrl={m.logoUrl ?? m.coverUrl ?? null}
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
          <DefaultableField
            label="العنوان"
            value={form.trustStripTitle}
            fallback={APP_DEFAULTS.trustStripTitle}
            onChange={(v) => update('trustStripTitle', v)}
            maxLength={120}
          />
          <DefaultableField
            label="السطر الفرعي"
            value={form.trustStripSubtitle}
            fallback={APP_DEFAULTS.trustStripSubtitle}
            onChange={(v) => update('trustStripSubtitle', v)}
            maxLength={160}
          />
        </>
      )}
    </SectionCard>
  );
}

// ── Shared bits ─────────────────────────────────────────────────────────

/**
 * A text field for a setting that falls back to copy baked into the app.
 *
 * These used to render EMPTY whenever nothing had been saved, with the real
 * text only hinted in the placeholder — so the page never showed what the app
 * was actually displaying, and editing meant retyping the whole line from
 * memory. It now loads the live value (the stored override, or the app's own
 * default when there is none), says which of the two it is, and offers a way
 * back to the default. Nothing is written until Save, so merely opening the
 * page still cannot turn a default into an override.
 */
function DefaultableField({
  label,
  hint,
  value,
  fallback,
  onChange,
  maxLength,
  multiline,
}: {
  label: string;
  hint?: string;
  value: string | null;
  /** What the app draws when `value` is null. */
  fallback: string;
  onChange: (v: string | null) => void;
  maxLength?: number;
  multiline?: boolean;
}) {
  const isCustom = value !== null && value !== '';
  const shown = isCustom ? value : fallback;
  return (
    <Field label={label} hint={hint}>
      <div className="space-y-1.5">
        {multiline ? (
          <textarea
            value={shown}
            onChange={(e) => onChange(e.target.value)}
            maxLength={maxLength}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:border-brand-red resize-y"
          />
        ) : (
          <Input value={shown} onChange={(e) => onChange(e.target.value)} maxLength={maxLength} />
        )}
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-[11px] font-bold ${isCustom ? 'text-brand-red' : 'text-muted-foreground'}`}
          >
            {isCustom ? '✎ نص مخصص' : '✓ النص الأصلي من التطبيق'}
          </span>
          {isCustom && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-[11px] text-brand-red hover:underline"
            >
              رجّع للأصلي
            </button>
          )}
        </div>
      </div>
    </Field>
  );
}

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
  imageUrl,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: () => void;
  /** Thumbnail of the thing being picked. A name-only list made the admin guess
   *  which store or product they were putting on the customer's home screen. */
  imageUrl?: string | null;
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
      {imageUrl !== undefined && (
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/50">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="grid h-full w-full place-items-center text-muted-foreground">
              <Images className="h-4 w-4" />
            </div>
          )}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold truncate">{label}</div>
        {hint && <div className="text-xs text-muted-foreground truncate">{hint}</div>}
      </div>
    </label>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Slider offers
//
// The mobile home screen has always rendered GET /offers as its top carousel,
// but nothing in the system ever wrote to that table — so it was permanently
// empty. This tab is the missing authoring side: create, reorder, hide and
// delete the slides customers see.
//
// The featuredOfferIds picker on the neighbouring tab chooses WHICH of these
// appear first; this tab is where they come from in the first place.
// ────────────────────────────────────────────────────────────────────────────

interface Offer {
  id: string;
  title: string;
  titleAr: string;
  imageUrl: string;
  linkType: string;
  linkValue: string | null;
  sortOrder: number;
  isActive: boolean;
}

/** Blank slide used when the admin hits "إضافة شريحة". */
const EMPTY_OFFER = {
  titleAr: '',
  imageUrl: '',
  linkType: 'NONE',
  linkValue: '',
  sortOrder: 0,
  isActive: true,
};

function SliderTab() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Offer> | null>(null);

  const { data: offers, isLoading } = useQuery({
    queryKey: ['admin-offers'],
    queryFn: () => api.adminListOffers() as Promise<Offer[]>,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['admin-offers'] });
  };

  const save = useMutation({
    mutationFn: (o: Partial<Offer>) =>
      o.id ? api.adminUpdateOffer(o.id, o) : api.adminCreateOffer(o),
    onSuccess: () => {
      toast.success('تم الحفظ');
      setEditing(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || 'فشل الحفظ'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.adminDeleteOffer(id),
    onSuccess: () => {
      toast.success('تم الحذف');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || 'فشل الحذف'),
  });

  // Reordering swaps sortOrder with the neighbour instead of renumbering the
  // whole list, so moving one slide can't rewrite every other row.
  const swap = (a: Offer, b: Offer) => {
    void save.mutateAsync({ id: a.id, sortOrder: b.sortOrder });
    void save.mutateAsync({ id: b.id, sortOrder: a.sortOrder });
  };

  if (isLoading) return <CardSkeleton />;

  const list = offers ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-black">شرائح السلايدر</div>
          <div className="text-xs text-muted-foreground">
            تظهر أعلى الصفحة الرئيسية في التطبيق — الترتيب من أعلى لأسفل.
          </div>
        </div>
        <Button onClick={() => setEditing({ ...EMPTY_OFFER, sortOrder: list.length })}>
          إضافة شريحة
        </Button>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border p-8 text-center text-muted-foreground">
          <Images className="w-8 h-8 mx-auto mb-2 opacity-60" />
          <div className="font-bold">لا توجد شرائح بعد</div>
          <div className="text-xs mt-1">أضف أول شريحة لتظهر للعملاء في الصفحة الرئيسية.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((o: Offer, i: number) => (
            <div
              key={o.id}
              className="flex items-center gap-3 rounded-xl border border-border p-2 bg-card"
            >
              <img
                src={o.imageUrl}
                alt={o.titleAr}
                className="w-28 h-16 rounded-lg object-cover bg-muted shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{o.titleAr}</div>
                <div className="text-xs text-muted-foreground">
                  {o.isActive ? 'ظاهر' : 'مخفي'} · ترتيب {o.sortOrder}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  disabled={i === 0}
                  onClick={() => swap(o, list[i - 1]!)}
                  title="تحريك لأعلى"
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  disabled={i === list.length - 1}
                  onClick={() => swap(o, list[i + 1]!)}
                  title="تحريك لأسفل"
                >
                  ↓
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => save.mutate({ id: o.id, isActive: !o.isActive })}
                  title={o.isActive ? 'إخفاء' : 'إظهار'}
                >
                  {o.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </Button>
                <Button variant="ghost" onClick={() => setEditing(o)}>
                  تعديل
                </Button>
                <Button
                  variant="ghost"
                  className="text-red-600"
                  onClick={() => {
                    if (confirm(`حذف "${o.titleAr}" نهائياً؟`)) remove.mutate(o.id);
                  }}
                >
                  حذف
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="rounded-xl border border-border p-4 space-y-3 bg-card">
          <div className="font-black">{editing.id ? 'تعديل شريحة' : 'شريحة جديدة'}</div>

          <OfferImageField
            value={editing.imageUrl ?? ''}
            onChange={(url) => setEditing({ ...editing, imageUrl: url })}
          />

          <Field label="العنوان">
            <Input
              value={editing.titleAr ?? ''}
              onChange={(e) => setEditing({ ...editing, titleAr: e.target.value })}
              placeholder="مثال: خصم 20% على أول طلب"
            />
          </Field>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => save.mutate(editing)}
              disabled={save.isPending || !editing.imageUrl || !editing.titleAr}
            >
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ'}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              إلغاء
            </Button>
            {!editing.imageUrl && (
              <span className="text-xs text-muted-foreground">الصورة مطلوبة</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Wide, banner-shaped image picker for one slide. */
function OfferImageField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <div className="text-xs font-bold text-muted-foreground mb-1">صورة الشريحة</div>
      <label className="relative block w-full aspect-[16/6] rounded-xl border-2 border-dashed border-border overflow-hidden cursor-pointer bg-muted/30 hover:border-brand-red/60 transition">
        {value ? (
          <img src={value} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-muted-foreground">
            <Images className="w-6 h-6" />
            <span className="text-[11px]">اضغط لرفع صورة (يفضّل 1600×600)</span>
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-brand-red" />
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            try {
              const r = await uploadFile(file);
              onChange(r.url);
            } catch (err) {
              toast.error((err as Error).message || 'فشل رفع الصورة');
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// "الأكثر طلباً" — the curated product rail on the mobile home.
//
// Pinned by hand rather than derived from sales, because the point is to
// promote what the business WANTS to sell, which is not always what already
// sells. The neighbouring "عروض اليوم" rail needs no picker at all: it shows
// whatever currently has a sale price, so it maintains itself.
// ────────────────────────────────────────────────────────────────────────────

interface PickerProduct {
  id: string;
  nameAr: string;
  price: number | string;
  imageUrl?: string | null;
  merchant?: { storeNameAr?: string } | null;
}

function FeaturedProductsTab({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');

  // Search hits the server; a catalogue here runs to thousands of rows, so
  // filtering a downloaded page would only ever search that page.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 300);
    return () => clearTimeout(t);
  }, [term]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'products', 'picker', debounced],
    queryFn: () =>
      api.adminListProducts({
        pageSize: 20,
        ...(debounced ? { search: debounced } : {}),
      }) as Promise<{
        items: PickerProduct[];
      }>,
  });

  // The chosen products may not be in the current search page, so they are
  // fetched separately — otherwise the list of what you picked would blank out
  // the moment you typed.
  const { data: chosen } = useQuery({
    queryKey: ['admin', 'products', 'chosen', selected],
    queryFn: () =>
      api.adminListProducts({ ids: selected.join(','), pageSize: 50 }) as Promise<{
        items: PickerProduct[];
      }>,
    enabled: selected.length > 0,
  });

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const results = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div>
        <div className="font-black">منتجات قسم «الأكثر طلباً»</div>
        <div className="text-xs text-muted-foreground">
          تظهر في الصفحة الرئيسية بالترتيب اللي تختاره. لو مفيش اختيار، القسم بيختفي من التطبيق.
        </div>
      </div>

      {selected.length > 0 && (
        <div className="rounded-xl border border-border p-3 space-y-2">
          <div className="text-xs font-bold text-muted-foreground">المختار ({selected.length})</div>
          <div className="flex flex-wrap gap-2">
            {(chosen?.items ?? []).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className="inline-flex items-center gap-2 bg-brand-red/10 text-brand-red rounded-full ps-2 pe-3 py-1 text-xs font-bold hover:bg-brand-red/20"
                title="إزالة"
              >
                {p.imageUrl && (
                  <img src={p.imageUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                )}
                {p.nameAr}
                <span aria-hidden>×</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="ابحث عن منتج بالاسم…"
          className="ps-9"
        />
      </div>

      {isLoading ? (
        <CardSkeleton />
      ) : results.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-6">
          {debounced ? `لا توجد منتجات تطابق «${debounced}»` : 'ابحث للعثور على منتجات'}
        </div>
      ) : (
        <div className="space-y-2">
          {results.map((p) => {
            const on = selected.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className={`w-full flex items-center gap-3 rounded-xl border p-2 text-start transition ${
                  on ? 'border-brand-red bg-brand-red/5' : 'border-border hover:bg-muted/40'
                }`}
              >
                <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden shrink-0">
                  {p.imageUrl && (
                    <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{p.nameAr}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {p.merchant?.storeNameAr ?? '—'} · {p.price} ج.م
                  </div>
                </div>
                <div
                  className={`w-5 h-5 rounded-md border flex items-center justify-center text-xs ${
                    on ? 'bg-brand-red border-brand-red text-white' : 'border-border'
                  }`}
                >
                  {on ? '✓' : ''}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
