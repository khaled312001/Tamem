/**
 * Site settings — admin-editable content shown on the public landing page
 * (apps/landing). The page mirrors the Home Settings structure: a header
 * "Save" button + tabs for Hero / Contact / Hours so the form stays
 * focused. Live update: the landing page client-side hydrates from
 * /site-config on load, so saves flow without any redeploy.
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
  heroTitle: string;
  heroSubtitle: string;
  heroCtaText: string;
  addressAr: string;
  email: string;
  workingHoursAr: string;
  contacts: ContactLine[];
}

type TabKey = 'hero' | 'contact' | 'general';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'hero', label: 'الرأس' },
  { key: 'contact', label: 'جهات الاتصال' },
  { key: 'general', label: 'العنوان والساعات' },
];

export function SiteSettingsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>('hero');
  const [form, setForm] = useState<SiteConfig | null>(null);

  const { data: cfg, isLoading } = useQuery({
    queryKey: ['admin', 'site-config'],
    queryFn: () => api.adminGetSiteConfig() as Promise<SiteConfig>,
  });

  useEffect(() => {
    if (cfg && !form) setForm(cfg);
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
  const dirty = JSON.stringify(form) !== JSON.stringify(cfg);

  const update = <K extends keyof SiteConfig>(key: K, value: SiteConfig[K]) =>
    setForm((p) => (p ? { ...p, [key]: value } : p));

  const updateContact = (idx: number, patch: Partial<ContactLine>) =>
    setForm((p) =>
      p
        ? {
            ...p,
            contacts: p.contacts.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
          }
        : p,
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

      {tab === 'hero' && (
        <div className="bg-white rounded-xl border border-border p-5 space-y-4">
          <Field label="عنوان الـ Hero" hint="السطر الكبير فى أعلى الصفحة">
            <Input value={form.heroTitle} onChange={(e) => update('heroTitle', e.target.value)} />
          </Field>
          <Field label="الوصف تحت العنوان">
            <Textarea
              value={form.heroSubtitle}
              onChange={(e) => update('heroSubtitle', e.target.value)}
              rows={3}
            />
          </Field>
          <Field label="نص زر الـ CTA">
            <Input
              value={form.heroCtaText}
              onChange={(e) => update('heroCtaText', e.target.value)}
            />
          </Field>
        </div>
      )}

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

      {tab === 'general' && (
        <div className="bg-white rounded-xl border border-border p-5 space-y-4">
          <Field label="العنوان">
            <Input value={form.addressAr} onChange={(e) => update('addressAr', e.target.value)} />
          </Field>
          <Field label="البريد الإلكتروني">
            <Input dir="ltr" value={form.email} onChange={(e) => update('email', e.target.value)} />
          </Field>
          <Field label="ساعات العمل">
            <Input
              value={form.workingHoursAr}
              onChange={(e) => update('workingHoursAr', e.target.value)}
            />
          </Field>

          <div className="mt-4 p-3 rounded-lg bg-brand-red/5 border border-brand-red/15 text-sm text-brand-dark inline-flex items-start gap-2">
            <MessageCircle className="w-4 h-4 mt-0.5 text-brand-red" />
            <span>
              لتطبيق التغييرات على الموقع، اعمل refresh لصفحة الـ landing بعد الحفظ. الموقع بيقرأ
              البيانات من <code className="font-mono">/api/v1/site-config</code> عند كل زيارة.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
