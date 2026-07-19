/**
 * Site settings — admin-editable content shown on the public landing page
 * (apps/landing). Live update: the landing hydrates from /site-config on load,
 * so saves flow without any redeploy.
 *
 * Contract with the landing: **the Setting key IS the `data-site` attribute**
 * on the landing element. To make a new string editable, put `data-site="myKey"`
 * on a LEAF node over there and add `{ key: 'myKey', … }` to TEXT_FIELDS here —
 * nothing else to wire. (Leaf-only: the hydration refuses to overwrite an element
 * that has child elements, so it can never strip a gradient span or a line break.)
 *
 * Empty field = keep the text baked into the site. The placeholder shows what is
 * currently live, so an admin can see what they are about to override.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, Loader2, MessageCircle, Phone, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button.js';
import { Field, Input, Textarea } from '../components/ui/Input.js';
import { CardSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';

interface ContactLine {
  key: string;
  phone: string;
  labelAr: string;
  descAr: string;
  whatsappMessage?: string;
}

interface SiteConfig {
  contacts: ContactLine[];
  [key: string]: unknown;
}

type TabKey = 'hero' | 'services' | 'stats' | 'contact' | 'general';

// Tab labels describe what the shop owner SEES on the site, not layout jargon.
// (Old labels like "الرأس" meant nothing to a non-technical admin.)
const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'hero', label: 'أعلى الصفحة', icon: '🏠' },
  { key: 'services', label: 'الخدمات', icon: '🚚' },
  { key: 'stats', label: 'الأرقام', icon: '📊' },
  { key: 'contact', label: 'أرقام التواصل', icon: '📞' },
  { key: 'general', label: 'العنوان والمواعيد', icon: '🕒' },
];

type FieldDef = { key: string; label: string; hint?: string; multiline?: boolean; ltr?: boolean };
// A group renders as ONE card: a titled box holding related fields, so "الخدمة
// الأولى" reads as a single thing on the site instead of five loose inputs
// labelled "نقطة ١..٣" with no idea which card they belong to.
type Group = { title: string; subtitle?: string; fields: FieldDef[] };

/** Section groups per tab. Each `key` must match a `data-site` attr on the landing. */
const SECTIONS: Record<Exclude<TabKey, 'contact'>, Group[]> = {
  hero: [
    {
      title: 'العنوان الرئيسي',
      subtitle: 'أكبر جملة في أول الصفحة',
      fields: [
        { key: 'heroTitleLine1', label: 'السطر الأول' },
        {
          key: 'heroTitleLine2',
          label: 'السطر الثاني',
          hint: 'سيب مسافة في الآخر قبل الكلمات المميّزة',
        },
        {
          key: 'heroTitleHighlight',
          label: 'الكلمات الملوّنة',
          hint: 'دي اللي بتظهر بالتدرّج الذهبي',
        },
      ],
    },
    {
      title: 'الوصف والزر',
      fields: [
        { key: 'heroSubtitle', label: 'الوصف تحت العنوان', multiline: true },
        { key: 'heroCtaText', label: 'نص الزر الكبير' },
      ],
    },
  ],
  services: [1, 2, 3].map((n) => ({
    title: `الخدمة ${['الأولى', 'الثانية', 'الثالثة'][n - 1]}`,
    subtitle: 'كارت خدمة كامل كما يظهر على الموقع',
    fields: [
      { key: `service${n}Title`, label: 'اسم الخدمة' },
      { key: `service${n}Desc`, label: 'الوصف', multiline: true },
      { key: `service${n}Bullet1`, label: 'ميزة ١' },
      { key: `service${n}Bullet2`, label: 'ميزة ٢' },
      ...(n !== 2 ? [{ key: `service${n}Bullet3`, label: 'ميزة ٣' }] : []),
    ],
  })),
  stats: [1, 2, 3, 4].map((n) => ({
    title: `الرقم ${['الأول', 'الثاني', 'الثالث', 'الرابع'][n - 1]}`,
    fields: [
      { key: `stat${n}Value`, label: 'الرقم' },
      { key: `stat${n}Suffix`, label: 'الوحدة', hint: 'مثال: دقيقة · منطقة' },
      { key: `stat${n}Label`, label: 'الوصف تحته' },
    ],
  })),
  general: [
    {
      title: 'بيانات التواصل والمواعيد',
      fields: [
        { key: 'addressAr', label: 'العنوان' },
        { key: 'email', label: 'البريد الإلكتروني', ltr: true },
        { key: 'workingHoursAr', label: 'ساعات العمل' },
      ],
    },
  ],
};

/** What the landing currently shows when a field is left empty. Placeholder only. */
const DEFAULTS: Record<string, string> = {
  heroTitleLine1: 'أول تطبيق دليفري وشحن',
  heroTitleLine2: 'متكامل في ',
  heroTitleHighlight: 'صعيد مصر',
  heroCtaText: 'Google Play',
  heroSubtitle:
    'اطلب من السوبر ماركت أو الصيدلية أو المطعم في قفط، اشحن طرودك لأي محافظة، أو شغّل تجارتك مع مندوبين ثقة — كله من تطبيق واحد. مقرنا الرئيسي في مركز قفط، محافظة قنا.',
  service1Title: 'دليفري داخل قفط',
  service1Desc:
    'سوبر ماركت، صيدلية، مطاعم، وتوصيل مستندات — من مطاعم ومحلات مركز قفط لحد باب بيتك.',
  service1Bullet1: 'متوسط زمن ٣٠-٤٥ دقيقة',
  service1Bullet2: 'المندوب بيتصل بيك قبل ما يوصل',
  service1Bullet3: 'كاش · فودافون كاش · إنستاباي',
  service2Title: 'شحن بين المحافظات',
  service2Desc: 'شحن طرود وبضائع من قنا للأقصر وأسوان والبحر الأحمر — والسعر يوصلك قبل ما نتحرك.',
  service2Bullet1: 'السعر حسب المسافة والوزن',
  service2Bullet2: 'تتبع الشحنة خطوة بخطوة من التطبيق',
  service3Title: 'طلبات التجار والشركات',
  service3Desc: 'مخصص للشركات والمحلات: منتجات متعددة من مخازن مختلفة لعدة فروع.',
  service3Bullet1: 'استلام من عدة نقاط وتوصيل لعدة عناوين',
  service3Bullet2: 'عرض سعر مخصص لكل طلب',
  service3Bullet3: 'حساب تجاري ومتابعة شهرية',
  stat1Value: '30-45',
  stat1Suffix: 'دقيقة',
  stat1Label: 'متوسط زمن التوصيل داخل قفط',
  stat2Value: '39',
  stat2Suffix: 'منطقة',
  stat2Label: 'تغطية مركز قفط وقراه',
  stat3Value: '4',
  stat3Suffix: 'خطوط',
  stat3Label: 'خطوط دليفري وشحن ودعم',
  stat4Value: '3',
  stat4Suffix: 'طرق دفع',
  stat4Label: 'كاش · فودافون كاش · إنستاباي',
  // العنوان والمواعيد — the live values currently on the site (Contact/Footer).
  addressAr: 'المقر الرئيسي — مركز قفط، محافظة قنا',
  email: 'info@deliverytamem.com',
  workingHoursAr: 'يومياً 10:00 ص — 1:00 بعد منتصف الليل',
};

/** The four real Tamem lines — used to seed the contacts tab when the backend
 *  has none saved yet, so the admin edits the live numbers, not a blank list. */
const DEFAULT_CONTACTS: ContactLine[] = [
  {
    key: 'delivery1',
    phone: '+201070750167',
    labelAr: 'خدمة الدليفري — خط 1',
    descAr: 'طلبات داخل المدينة (مطاعم، صيدليات، سوبر ماركت)',
    whatsappMessage: 'أهلاً، أريد طلب توصيل',
  },
  {
    key: 'delivery2',
    phone: '+201070750168',
    labelAr: 'خدمة الدليفري — خط 2',
    descAr: 'خط بديل لخدمة التوصيل داخل المدينة',
    whatsappMessage: 'أهلاً، أريد طلب توصيل',
  },
  {
    key: 'shipping',
    phone: '+201070750165',
    labelAr: 'خدمة الشحن',
    descAr: 'الشحن بين المحافظات والمناطق',
    whatsappMessage: 'أهلاً، أريد طلب شحن',
  },
  {
    key: 'support',
    phone: '+201070750169',
    labelAr: 'الشكاوى والتواصل مع الإدارة',
    descAr: 'لأي استفسار أو شكوى أو تواصل إداري',
    whatsappMessage: 'أهلاً، عندي شكوى/استفسار للإدارة',
  },
];

const ALL_TEXT_KEYS = Object.values(SECTIONS).flatMap((groups) =>
  groups.flatMap((g) => g.fields.map((f) => f.key)),
);

export function SiteSettingsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>('hero');
  const [form, setForm] = useState<SiteConfig | null>(null);
  // A snapshot of the loaded values, so we can show what changed and offer undo.
  const [initial, setInitial] = useState<Record<string, string>>({});

  const { data: cfg, isLoading } = useQuery({
    queryKey: ['admin', 'site-config'],
    queryFn: () => api.adminGetSiteConfig() as Promise<SiteConfig>,
  });

  useEffect(() => {
    if (cfg && !form) {
      // The backend returns loose settings (and may send `contacts` as a JSON
      // string or omit it). Normalise so the render never hits `.map` on undefined.
      const raw = cfg as unknown as Record<string, unknown>;
      let contacts = raw.contacts as unknown;
      if (typeof contacts === 'string') {
        try {
          contacts = JSON.parse(contacts);
        } catch {
          contacts = [];
        }
      }
      const savedContacts = Array.isArray(contacts) ? (contacts as ContactLine[]) : [];
      const next: SiteConfig = {
        // Seed with the real four lines when nothing is saved yet, so the tab is
        // never an empty list the admin has to rebuild from scratch.
        contacts: savedContacts.length ? savedContacts : DEFAULT_CONTACTS.map((c) => ({ ...c })),
      };
      // Pre-fill each field with the SAVED override if there is one, else the
      // text currently live on the site (DEFAULTS). Admins edit real text, never
      // a blank box — and saving an untouched field just re-writes the same text.
      const snap: Record<string, string> = {};
      for (const k of ALL_TEXT_KEYS) {
        const saved = raw[k];
        next[k] = typeof saved === 'string' && saved !== '' ? saved : (DEFAULTS[k] ?? '');
        snap[k] = next[k] as string;
      }
      setForm(next);
      setInitial(snap);
    }
  }, [cfg, form]);

  // Warn before navigating away with unsaved edits — losing site copy to an
  // accidental back-button is exactly the "afraid of breaking it" case.
  const dirtyKeys = form ? ALL_TEXT_KEYS.filter((k) => (form[k] as string) !== initial[k]) : [];
  useEffect(() => {
    if (dirtyKeys.length === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyKeys.length]);

  const mutation = useMutation({
    mutationFn: (data: SiteConfig) => api.adminUpdateSiteConfig(data),
    onSuccess: () => {
      toast.success('تم حفظ صفحة الموقع — سيتحدث الموقع تلقائياً');
      qc.invalidateQueries({ queryKey: ['admin', 'site-config'] });
    },
    onError: (err: Error) => toast.error(err.message || 'فشل الحفظ'),
  });

  if (isLoading || !form) return <CardSkeleton />;

  const update = (key: string, value: string) => setForm((p) => (p ? { ...p, [key]: value } : p));

  const updateContact = (idx: number, patch: Partial<ContactLine>) =>
    setForm((p) =>
      p ? { ...p, contacts: p.contacts.map((c, i) => (i === idx ? { ...c, ...patch } : c)) } : p,
    );
  const addContact = () =>
    setForm((p) =>
      p
        ? {
            ...p,
            contacts: [
              ...p.contacts,
              {
                key: `line${p.contacts.length + 1}`,
                phone: '+201',
                labelAr: 'خط جديد',
                descAr: 'وصف الخط',
                whatsappMessage: '',
              },
            ],
          }
        : p,
    );
  const removeContact = (idx: number) =>
    setForm((p) => (p ? { ...p, contacts: p.contacts.filter((_, i) => i !== idx) } : p));

  const renderField = (f: FieldDef) => {
    const val = (form[f.key] as string) ?? '';
    const changed = val !== (initial[f.key] ?? '');
    const canReset = (DEFAULTS[f.key] ?? '') !== '' && val !== (DEFAULTS[f.key] ?? '');
    return (
      <Field
        key={f.key}
        label={
          (
            <span className="inline-flex items-center gap-1.5">
              {f.label}
              {changed && (
                <span className="text-[10px] font-bold text-amber-600 bg-amber-100 dark:bg-amber-900/40 rounded px-1.5 py-0.5">
                  غير محفوظ
                </span>
              )}
              {canReset && (
                <button
                  type="button"
                  onClick={() => update(f.key, DEFAULTS[f.key] ?? '')}
                  className="text-[10px] text-brand-red hover:underline"
                >
                  رجّع الأصلي
                </button>
              )}
            </span>
          ) as unknown as string
        }
        hint={f.hint}
      >
        {f.multiline ? (
          <Textarea
            rows={3}
            value={val}
            placeholder={DEFAULTS[f.key] ?? ''}
            onChange={(e) => update(f.key, e.target.value)}
          />
        ) : (
          <Input
            dir={f.ltr ? 'ltr' : undefined}
            value={val}
            placeholder={DEFAULTS[f.key] ?? ''}
            onChange={(e) => update(f.key, e.target.value)}
          />
        )}
      </Field>
    );
  };

  const renderGroups = (groups: Group[]) => (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.title} className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/30">
            <div className="font-bold text-brand-dark">{g.title}</div>
            {g.subtitle && <div className="text-xs text-muted-foreground mt-0.5">{g.subtitle}</div>}
          </div>
          <div className="p-5 space-y-4">{g.fields.map(renderField)}</div>
        </div>
      ))}
      <div className="p-3 rounded-lg bg-brand-red/5 border border-brand-red/15 text-sm text-brand-dark flex items-start gap-2">
        <MessageCircle className="w-4 h-4 mt-0.5 text-brand-red shrink-0" />
        <span>
          الحقول مملوءة بالنص الظاهر حالياً على الموقع — عدّل أي حقل مباشرةً، و«رجّع الأصلي» يعيده
          للنص الافتراضي.
        </span>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-brand-dark inline-flex items-center gap-2">
            <Globe className="w-6 h-6" />
            صفحة الموقع
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            عدّل نصوص وأرقام الموقع — التغييرات تظهر مباشرةً بعد الحفظ.{' '}
            <a
              href="https://deliverytamem.com/"
              target="_blank"
              rel="noreferrer"
              className="text-brand-red font-bold hover:underline"
            >
              شاهد الموقع ↗
            </a>
          </p>
        </div>
        <Button
          size="md"
          disabled={mutation.isPending || dirtyKeys.length === 0}
          onClick={() => mutation.mutate(form)}
        >
          {mutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {dirtyKeys.length > 0 ? `حفظ ${dirtyKeys.length} تغيير` : 'محفوظ'}
        </Button>
      </div>

      {/* Tabs — labelled by what the admin sees on the site, with a per-tab
          unsaved-changes dot so it's obvious where pending edits live. */}
      <div className="bg-white rounded-xl border border-border p-1 inline-flex flex-wrap gap-1">
        {TABS.map((t) => {
          const active = tab === t.key;
          const tabKeys =
            t.key === 'contact' ? [] : SECTIONS[t.key].flatMap((g) => g.fields.map((f) => f.key));
          const tabDirty = tabKeys.some((k) => (form[k] as string) !== initial[k]);
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition inline-flex items-center gap-1.5 ${
                active ? 'bg-brand-red text-white' : 'text-brand-dark hover:bg-muted'
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
              {tabDirty && (
                <span
                  className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-white' : 'bg-amber-500'}`}
                />
              )}
            </button>
          );
        })}
      </div>

      {tab !== 'contact' && renderGroups(SECTIONS[tab])}

      {tab === 'contact' && (
        <div className="space-y-3">
          {form.contacts.map((c, idx) => (
            <div
              key={idx}
              className="bg-white rounded-xl border border-border p-4 space-y-3 relative"
            >
              <div className="flex items-center gap-2 justify-between">
                <div className="inline-flex items-center gap-2 font-black text-brand-red">
                  <Phone className="w-4 h-4" />
                  <span>خط {idx + 1}</span>
                </div>
                {form.contacts.length > 1 && (
                  <button
                    onClick={() => removeContact(idx)}
                    className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg"
                    title="حذف الخط"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="اسم الخط">
                  <Input
                    value={c.labelAr}
                    onChange={(e) => updateContact(idx, { labelAr: e.target.value })}
                  />
                </Field>
                <Field label="رقم الهاتف (E.164)">
                  <Input
                    dir="ltr"
                    value={c.phone}
                    onChange={(e) => updateContact(idx, { phone: e.target.value })}
                  />
                </Field>
                <Field label="الوصف">
                  <Input
                    value={c.descAr}
                    onChange={(e) => updateContact(idx, { descAr: e.target.value })}
                  />
                </Field>
                <Field label="رسالة الواتساب الافتراضية" hint="تظهر مكتوبة لما يضغط واتساب">
                  <Input
                    value={c.whatsappMessage ?? ''}
                    onChange={(e) => updateContact(idx, { whatsappMessage: e.target.value })}
                    placeholder="أهلاً، أريد …"
                  />
                </Field>
              </div>
            </div>
          ))}
          <Button onClick={addContact} variant="ghost">
            <Plus className="w-4 h-4" /> إضافة خط جديد
          </Button>
        </div>
      )}
    </div>
  );
}
