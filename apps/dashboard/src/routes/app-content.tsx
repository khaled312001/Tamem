/**
 * App content — the copy inside the MOBILE app that an admin must be able to
 * change without a store release.
 *
 * The app reads GET /app-content on launch (30 min stale, 5 min server cache),
 * so a save here reaches customers within minutes instead of waiting for a
 * Play review. Anything still hardcoded in the app needs a new build, which is
 * exactly what this screen exists to avoid.
 *
 * Not to be confused with:
 *   - صفحة الموقع (/site-settings)  → the public landing page
 *   - صفحة التطبيق (/home-settings) → layout and visibility of home sections
 * This screen owns TEXT the app shows: support hours, FAQ, the «عن تَميم»
 * pillars, and the announcement strip.
 *
 * Emptying a list is a real instruction, not a mistake: the app hides the
 * section heading along with the rows.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CircleAlert,
  FileText,
  Headset,
  Info,
  Loader2,
  Megaphone,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button.js';
import { Field, Input, Textarea } from '../components/ui/Input.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { CardSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';

interface Faq {
  q: string;
  a: string;
}
interface Pillar {
  titleAr: string;
  bodyAr: string;
}
interface Announcement {
  enabled: boolean;
  titleAr: string;
  bodyAr: string;
  variant: 'info' | 'warn';
}
interface AppContent {
  supportHoursAr: string;
  workingHoursAr: string;
  supportEmail: string;
  websiteUrl: string;
  aboutTaglineAr: string;
  faqs: Faq[];
  pillars: Pillar[];
  announcement: Announcement;
}

function Card({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: typeof Info;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-xl border border-border p-5 space-y-4">
      <header className="flex items-start gap-3">
        <span className="shrink-0 w-9 h-9 rounded-lg bg-brand-red/10 grid place-items-center">
          <Icon className="w-4 h-4 text-brand-red" />
        </span>
        <div>
          <h2 className="font-bold">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

export function AppContentPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<AppContent>({
    queryKey: ['admin', 'app-content'],
    queryFn: () => api.raw.get('/admin/app-content').then((r) => r.data.data),
  });

  const [form, setForm] = useState<AppContent | null>(null);
  // Load once the server answers. `data` is also the reset point after a save,
  // because the PUT replies with the merged result.
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: (body: AppContent) =>
      api.raw.put('/admin/app-content', body).then((r) => r.data.data),
    onSuccess: (fresh: AppContent) => {
      setForm(fresh);
      toast.success('تم الحفظ — التطبيق هيشوف التعديل خلال دقايق');
      void qc.invalidateQueries({ queryKey: ['admin', 'app-content'] });
    },
    onError: (err: Error) => toast.error(err.message || 'فشل الحفظ'),
  });

  if (isLoading || !form) {
    return (
      <div className="space-y-4">
        <PageHeader title="محتوى التطبيق" icon={FileText} />
        <CardSkeleton />
      </div>
    );
  }

  const set = <K extends keyof AppContent>(key: K, value: AppContent[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const setAnnouncement = <K extends keyof Announcement>(key: K, value: Announcement[K]) =>
    setForm((f) => (f ? { ...f, announcement: { ...f.announcement, [key]: value } } : f));

  const ann = form.announcement;

  return (
    <div className="space-y-4 pb-24">
      <PageHeader
        title="محتوى التطبيق"
        icon={FileText}
        subtitle="النصوص اللي جوه تطبيق العميل — التعديل بيوصل من غير نسخة جديدة على المتجر"
        actions={
          <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
            {save.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span className="ms-2">حفظ</span>
          </Button>
        }
      />

      <Card
        title="شريط الإعلان"
        subtitle="يظهر أعلى الصفحة الرئيسية في التطبيق. استخدمه للحاجات المؤقتة — توقّف خدمة، مواعيد عيد."
        icon={Megaphone}
      >
        <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 accent-[var(--brand-red,#E0301E)]"
            checked={ann.enabled}
            onChange={(e) => setAnnouncement('enabled', e.target.checked)}
          />
          شغّال
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="العنوان" hint="لازم يتكتب قبل تشغيل الشريط">
            <Input
              value={ann.titleAr}
              onChange={(e) => setAnnouncement('titleAr', e.target.value)}
              placeholder="خدمة الشحن متوقفة النهارده"
            />
          </Field>
          <Field label="النوع">
            <div className="flex gap-2">
              {(
                [
                  { v: 'info', label: 'معلومة', Icon: Info },
                  { v: 'warn', label: 'تحذير', Icon: CircleAlert },
                ] as const
              ).map(({ v, label, Icon }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAnnouncement('variant', v)}
                  className={
                    'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm transition ' +
                    (ann.variant === v
                      ? 'border-brand-red bg-brand-red/10 font-bold'
                      : 'border-border bg-white hover:bg-muted')
                  }
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <Field label="الشرح" hint="اختياري — سطر تحت العنوان">
          <Textarea
            rows={2}
            value={ann.bodyAr}
            onChange={(e) => setAnnouncement('bodyAr', e.target.value)}
          />
        </Field>
      </Card>

      <Card
        title="الدعم والتواصل"
        subtitle="بيظهر في صفحة «الدعم والمساعدة» و«عن تَميم»"
        icon={Headset}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="سطر التوفّر" hint="أعلى صفحة الدعم">
            <Input
              value={form.supportHoursAr}
              onChange={(e) => set('supportHoursAr', e.target.value)}
            />
          </Field>
          <Field label="ساعات العمل" hint="كارت «ساعات العمل»">
            <Input
              value={form.workingHoursAr}
              onChange={(e) => set('workingHoursAr', e.target.value)}
            />
          </Field>
          <Field label="البريد الإلكتروني">
            <Input
              dir="ltr"
              className="text-left"
              value={form.supportEmail}
              onChange={(e) => set('supportEmail', e.target.value)}
            />
          </Field>
          <Field label="رابط الموقع" hint="صفحات الشروط والخصوصية والاسترجاع مبنية عليه">
            <Input
              dir="ltr"
              className="text-left"
              value={form.websiteUrl}
              onChange={(e) => set('websiteUrl', e.target.value)}
            />
          </Field>
          <Field label="وصف تَميم" hint="السطر الصغير تحت عنوان صفحة «عن تَميم»">
            <Input
              value={form.aboutTaglineAr}
              onChange={(e) => set('aboutTaglineAr', e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card
        title="الأسئلة الشائعة"
        subtitle="في صفحة الدعم. امسح كل الأسئلة لو عاوز تخفي القسم كله."
        icon={Info}
      >
        <div className="space-y-3">
          {form.faqs.map((f, i) => (
            <div key={i} className="rounded-lg border border-border p-3 space-y-2 bg-muted/30">
              <div className="flex items-center gap-2">
                <Input
                  value={f.q}
                  placeholder="السؤال"
                  onChange={(e) =>
                    set(
                      'faqs',
                      form.faqs.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)),
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="حذف السؤال"
                  onClick={() =>
                    set(
                      'faqs',
                      form.faqs.filter((_, j) => j !== i),
                    )
                  }
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
              <Textarea
                rows={2}
                value={f.a}
                placeholder="الإجابة"
                onChange={(e) =>
                  set(
                    'faqs',
                    form.faqs.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)),
                  )
                }
              />
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => set('faqs', [...form.faqs, { q: '', a: '' }])}
        >
          <Plus className="w-4 h-4" />
          <span className="ms-1">سؤال جديد</span>
        </Button>
      </Card>

      <Card
        title="محاور «عن تَميم»"
        subtitle="الأربع كروت تحت «ليه تَميم؟». الأيقونة بتتبع المكان في الترتيب، مش النص."
        icon={FileText}
      >
        <div className="space-y-3">
          {form.pillars.map((p, i) => (
            <div key={i} className="rounded-lg border border-border p-3 space-y-2 bg-muted/30">
              <div className="flex items-center gap-2">
                <Input
                  value={p.titleAr}
                  placeholder="العنوان"
                  onChange={(e) =>
                    set(
                      'pillars',
                      form.pillars.map((x, j) => (j === i ? { ...x, titleAr: e.target.value } : x)),
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="حذف المحور"
                  onClick={() =>
                    set(
                      'pillars',
                      form.pillars.filter((_, j) => j !== i),
                    )
                  }
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
              <Textarea
                rows={2}
                value={p.bodyAr}
                placeholder="الشرح"
                onChange={(e) =>
                  set(
                    'pillars',
                    form.pillars.map((x, j) => (j === i ? { ...x, bodyAr: e.target.value } : x)),
                  )
                }
              />
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => set('pillars', [...form.pillars, { titleAr: '', bodyAr: '' }])}
        >
          <Plus className="w-4 h-4" />
          <span className="ms-1">محور جديد</span>
        </Button>
      </Card>
    </div>
  );
}
