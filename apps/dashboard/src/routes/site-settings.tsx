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

const TABS: { key: TabKey; label: string }[] = [
  { key: 'hero', label: 'الرأس' },
  { key: 'services', label: 'الخدمات' },
  { key: 'stats', label: 'الأرقام' },
  { key: 'contact', label: 'جهات الاتصال' },
  { key: 'general', label: 'العنوان والساعات' },
];

type FieldDef = { key: string; label: string; hint?: string; multiline?: boolean; ltr?: boolean };

/** Text fields per tab. Each `key` must match a `data-site` attr on the landing. */
const TEXT_FIELDS: Record<Exclude<TabKey, 'contact'>, FieldDef[]> = {
  hero: [
    { key: 'heroTitleLine1', label: 'العنوان — السطر الأول' },
    {
      key: 'heroTitleLine2',
      label: 'العنوان — السطر الثاني',
      hint: 'سيب مسافة في الآخر قبل الكلمات المميّزة',
    },
    { key: 'heroTitleHighlight', label: 'الكلمات المميّزة', hint: 'دي اللي بتظهر بالتدرّج الذهبي' },
    { key: 'heroSubtitle', label: 'الوصف تحت العنوان', multiline: true },
    { key: 'heroCtaText', label: 'نص زر الدعوة للإجراء' },
  ],
  services: [
    { key: 'service1Title', label: 'الخدمة ١ — العنوان' },
    { key: 'service1Desc', label: 'الخدمة ١ — الوصف', multiline: true },
    { key: 'service1Bullet1', label: 'الخدمة ١ — نقطة ١' },
    { key: 'service1Bullet2', label: 'الخدمة ١ — نقطة ٢' },
    { key: 'service1Bullet3', label: 'الخدمة ١ — نقطة ٣' },
    { key: 'service2Title', label: 'الخدمة ٢ — العنوان' },
    { key: 'service2Desc', label: 'الخدمة ٢ — الوصف', multiline: true },
    { key: 'service2Bullet1', label: 'الخدمة ٢ — نقطة ١' },
    { key: 'service2Bullet2', label: 'الخدمة ٢ — نقطة ٢' },
    { key: 'service3Title', label: 'الخدمة ٣ — العنوان' },
    { key: 'service3Desc', label: 'الخدمة ٣ — الوصف', multiline: true },
    { key: 'service3Bullet1', label: 'الخدمة ٣ — نقطة ١' },
    { key: 'service3Bullet2', label: 'الخدمة ٣ — نقطة ٢' },
    { key: 'service3Bullet3', label: 'الخدمة ٣ — نقطة ٣' },
  ],
  stats: [
    { key: 'stat1Value', label: 'الرقم ١ — القيمة' },
    { key: 'stat1Suffix', label: 'الرقم ١ — الوحدة' },
    { key: 'stat1Label', label: 'الرقم ١ — الوصف' },
    { key: 'stat2Value', label: 'الرقم ٢ — القيمة' },
    { key: 'stat2Suffix', label: 'الرقم ٢ — الوحدة' },
    { key: 'stat2Label', label: 'الرقم ٢ — الوصف' },
    { key: 'stat3Value', label: 'الرقم ٣ — القيمة' },
    { key: 'stat3Suffix', label: 'الرقم ٣ — الوحدة' },
    { key: 'stat3Label', label: 'الرقم ٣ — الوصف' },
    { key: 'stat4Value', label: 'الرقم ٤ — القيمة' },
    { key: 'stat4Suffix', label: 'الرقم ٤ — الوحدة' },
    { key: 'stat4Label', label: 'الرقم ٤ — الوصف' },
  ],
  general: [
    { key: 'addressAr', label: 'العنوان' },
    { key: 'email', label: 'البريد الإلكتروني', ltr: true },
    { key: 'workingHoursAr', label: 'ساعات العمل' },
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
};

const ALL_TEXT_KEYS = Object.values(TEXT_FIELDS).flatMap((fs) => fs.map((f) => f.key));

export function SiteSettingsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>('hero');
  const [form, setForm] = useState<SiteConfig | null>(null);

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
      const next: SiteConfig = {
        contacts: Array.isArray(contacts) ? (contacts as ContactLine[]) : [],
      };
      // Pre-fill each field with the SAVED override if there is one, else the
      // text currently live on the site (DEFAULTS). Admins edit real text, never
      // a blank box — and saving an untouched field just re-writes the same text.
      for (const k of ALL_TEXT_KEYS) {
        const saved = raw[k];
        next[k] = typeof saved === 'string' && saved !== '' ? saved : (DEFAULTS[k] ?? '');
      }
      setForm(next);
    }
  }, [cfg, form]);

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

  const renderFields = (fields: FieldDef[]) => (
    <div className="bg-white rounded-xl border border-border p-5 space-y-4">
      {fields.map((f) => (
        <Field key={f.key} label={f.label} hint={f.hint}>
          {f.multiline ? (
            <Textarea
              rows={3}
              value={(form[f.key] as string) ?? ''}
              placeholder={DEFAULTS[f.key] ?? ''}
              onChange={(e) => update(f.key, e.target.value)}
            />
          ) : (
            <Input
              dir={f.ltr ? 'ltr' : undefined}
              value={(form[f.key] as string) ?? ''}
              placeholder={DEFAULTS[f.key] ?? ''}
              onChange={(e) => update(f.key, e.target.value)}
            />
          )}
        </Field>
      ))}
      <div className="mt-2 p-3 rounded-lg bg-brand-red/5 border border-brand-red/15 text-sm text-brand-dark inline-flex items-start gap-2">
        <MessageCircle className="w-4 h-4 mt-0.5 text-brand-red shrink-0" />
        <span>
          اترك الحقل فاضي عشان تسيب النص الأصلي زي ما هو — النص الرمادي هو اللي ظاهر دلوقتي على
          الموقع.
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
            تحكّم في نصوص وأرقام صفحة الهبوط — الموقع بيتحدث تلقائياً بعد الحفظ
          </p>
        </div>
        <Button size="md" disabled={mutation.isPending} onClick={() => mutation.mutate(form)}>
          {mutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          حفظ
        </Button>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-border p-1 inline-flex flex-wrap gap-1">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
                active ? 'bg-brand-red text-white' : 'text-brand-dark hover:bg-muted'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab !== 'contact' && renderFields(TEXT_FIELDS[tab])}

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
