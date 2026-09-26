import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { Badge } from '../components/ui/Badge.js';
import { Button } from '../components/ui/Button.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Field, Input } from '../components/ui/Input.js';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rule = any;

const REWARD_LABEL: Record<string, string> = {
  FREE_DELIVERY: 'توصيل مجاني',
  DELIVERY_PERCENT: 'خصم نسبة',
  DELIVERY_FIXED: 'خصم مبلغ',
};
const AUDIENCE_LABEL: Record<string, string> = {
  ALL: 'كل العملاء',
  FIRST_ORDER: 'أول أوردر (عميل جديد)',
};
const SCHEDULE_LABEL: Record<string, string> = {
  ALWAYS: 'دائم',
  DATE_RANGE: 'فترة',
  SPECIFIC_DATES: 'أيام محددة',
  WEEKLY: 'أسبوعي',
};
const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
// Cairo, not UTC: the backend matches a promo's date against Africa/Cairo, so
// between midnight and 3am `toISOString()` handed the preset YESTERDAY — a
// «يوم مجاني» saved at 1am was already over before anyone ordered.
const todayISO = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());

function fetchRules(): Promise<Rule[]> {
  return api.raw.get('/admin/promos').then((r) => r.data.data.rules ?? []);
}

function rewardText(r: Rule): string {
  if (r.rewardType === 'FREE_DELIVERY') return 'توصيل مجاني';
  if (r.rewardType === 'DELIVERY_PERCENT') return `خصم ${Number(r.rewardValue ?? 0)}٪ توصيل`;
  return `خصم ${Number(r.rewardValue ?? 0)} ج.م توصيل`;
}
function scheduleText(r: Rule): string {
  if (r.scheduleType === 'ALWAYS') return 'دائم';
  if (r.scheduleType === 'DATE_RANGE') return `${r.dateFrom || '…'} ← ${r.dateTo || '…'}`;
  if (r.scheduleType === 'SPECIFIC_DATES') return `${(r.dates ?? []).length} يوم`;
  if (r.scheduleType === 'WEEKLY')
    return (r.weekdays ?? []).map((d: number) => WEEKDAYS[d]).join('، ') || 'بدون أيام';
  return '—';
}

export function PromosPage() {
  const qc = useQueryClient();
  const [editTarget, setEditTarget] = useState<Rule | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: rules, isLoading } = useQuery({
    queryKey: ['admin', 'promos'],
    queryFn: fetchRules,
  });

  const save = useMutation({
    mutationFn: (next: Rule[]) => api.raw.put('/admin/promos', { rules: next }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'promos'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const upsert = (rule: Rule) => {
    const list = rules ?? [];
    const next =
      rule.id && list.some((r) => r.id === rule.id)
        ? list.map((r) => (r.id === rule.id ? rule : r))
        : [...list, rule];
    save.mutate(next, { onSuccess: () => toast.success('تم حفظ العرض') });
  };
  const remove = (id: string) =>
    save.mutate(
      (rules ?? []).filter((r) => r.id !== id),
      {
        onSuccess: () => toast.success('تم حذف العرض'),
      },
    );
  const toggle = (id: string, isActive: boolean) =>
    save.mutate((rules ?? []).map((r) => (r.id === id ? { ...r, isActive } : r)));

  // ── دعوة صديق (referral) — تفعيل/إيقاف + إحصائيات ──
  const { data: referral } = useQuery({
    queryKey: ['admin', 'referral'],
    queryFn: () =>
      api.raw.get('/admin/referral').then(
        (r) =>
          r.data.data as {
            enabled: boolean;
            stats: { invited: number; joined: number; creditsUsed: number };
          },
      ),
  });
  const saveReferral = useMutation({
    mutationFn: (enabled: boolean) => api.raw.put('/admin/referral', { enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'referral'] });
      toast.success('تم الحفظ');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-brand-dark">العروض</h1>
          <p className="text-sm text-muted-foreground mt-1">
            عروض خصم رسوم التوصيل — أول أوردر مجاني، أيام مجانية، وأكتر. متحكّم فيها بالكامل من هنا.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          عرض جديد
        </Button>
      </div>

      <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 leading-relaxed">
        ⓘ العروض دي بتخصم من <b>رسوم التوصيل فقط</b> (مش المنتجات). أوردرات <b>«من قنا»</b> (فيها
        ترحيل) بتتستثنى تلقائيًا طول ما «استثناء الترحيل» مفعّل في العرض.
      </div>

      {/* دعوة صديق */}
      <div className="rounded-xl border border-border bg-white p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <h2 className="font-black text-brand-dark flex items-center gap-1.5">
              <Gift className="w-4 h-4 text-brand-red" /> دعوة صديق
            </h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              كل عميل عنده كود دعوة. أول ما صاحبه يسجّل بالكود ويعمل أول طلب من التطبيق، الاتنين
              ياخدوا <b>توصيل مجاني</b> على الطلب اللي بعده. (بيشتغل على التطبيق بس.)
            </p>
          </div>
          <button
            onClick={() => saveReferral.mutate(!referral?.enabled)}
            disabled={saveReferral.isPending || !referral}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-bold transition ${
              referral?.enabled
                ? 'bg-brand-red text-white'
                : 'bg-gray-100 text-gray-600 border border-border hover:bg-gray-200'
            }`}
          >
            {referral?.enabled ? '✓ مفعّل — إيقاف' : 'متوقف — تفعيل'}
          </button>
        </div>
        {referral && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-muted/40 py-2">
              <div className="text-lg font-black text-brand-dark">{referral.stats.invited}</div>
              <div className="text-[11px] text-muted-foreground">دعوات</div>
            </div>
            <div className="rounded-lg bg-muted/40 py-2">
              <div className="text-lg font-black text-brand-dark">{referral.stats.joined}</div>
              <div className="text-[11px] text-muted-foreground">انضموا وطلبوا</div>
            </div>
            <div className="rounded-lg bg-muted/40 py-2">
              <div className="text-lg font-black text-brand-dark">{referral.stats.creditsUsed}</div>
              <div className="text-[11px] text-muted-foreground">توصيلات مجانية اتصرفت</div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton rows={4} cols={6} />
          </div>
        ) : !rules?.length ? (
          <EmptyState
            icon={<Gift className="w-12 h-12" />}
            title="لا توجد عروض بعد"
            description="أنشئ أول عرض — مثلاً «أول أوردر توصيل مجاني»"
            action={<Button onClick={() => setCreateOpen(true)}>أنشئ عرض</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr className="text-right">
                  <th className="px-3 py-3 font-bold">الاسم</th>
                  <th className="px-3 py-3 font-bold">المكافأة</th>
                  <th className="px-3 py-3 font-bold">لمين</th>
                  <th className="px-3 py-3 font-bold">التوقيت</th>
                  <th className="px-3 py-3 font-bold">الاستخدام</th>
                  <th className="px-3 py-3 font-bold">مفعّل</th>
                  <th className="px-3 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-b border-border/50 ${r.isActive ? '' : 'opacity-50'}`}
                  >
                    <td className="px-3 py-3 font-bold">{r.nameAr}</td>
                    <td className="px-3 py-3">
                      <Badge>{rewardText(r)}</Badge>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {AUDIENCE_LABEL[r.audience] ?? r.audience}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <div>{SCHEDULE_LABEL[r.scheduleType] ?? r.scheduleType}</div>
                      <div className="text-muted-foreground">{scheduleText(r)}</div>
                    </td>
                    <td className="px-3 py-3 font-bold">
                      {r.usedCount ?? 0}
                      {r.usageLimitTotal ? (
                        <span className="text-xs text-muted-foreground">
                          {' '}
                          / {r.usageLimitTotal}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={!!r.isActive}
                        onChange={(e) => toggle(r.id, e.target.checked)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditTarget(r)}
                          title="تعديل"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm(`حذف العرض «${r.nameAr}»؟`)) remove(r.id);
                          }}
                          title="حذف"
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {createOpen && <PromoDialog onClose={() => setCreateOpen(false)} onSave={upsert} />}
      {editTarget && (
        <PromoDialog rule={editTarget} onClose={() => setEditTarget(null)} onSave={upsert} />
      )}
    </div>
  );
}

// ── قوالب جاهزة تملأ الفورم بضغطة ─────────────────────────────────────────
const PRESETS: { label: string; emoji: string; patch: Partial<Rule> }[] = [
  {
    label: 'أول أوردر مجاني',
    emoji: '🎁',
    patch: {
      nameAr: 'أول أوردر توصيل مجاني',
      rewardType: 'FREE_DELIVERY',
      audience: 'FIRST_ORDER',
      scheduleType: 'ALWAYS',
    },
  },
  {
    label: 'يوم مجاني',
    emoji: '📅',
    patch: {
      nameAr: `توصيل مجاني ${todayISO()}`,
      rewardType: 'FREE_DELIVERY',
      audience: 'ALL',
      scheduleType: 'SPECIFIC_DATES',
      dates: [todayISO()],
    },
  },
  {
    label: 'كل جمعة مجاني',
    emoji: '🕌',
    patch: {
      nameAr: 'توصيل مجاني كل جمعة',
      rewardType: 'FREE_DELIVERY',
      audience: 'ALL',
      scheduleType: 'WEEKLY',
      weekdays: [5],
    },
  },
];

// ── مكوّنات صغيرة للفورم ────────────────────────────────────────────────
function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3.5 space-y-3">
      <div className="text-[11px] font-black text-brand-red uppercase tracking-wide">{title}</div>
      {children}
    </div>
  );
}

function Seg({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={`px-3 py-2 rounded-lg border text-xs font-bold transition ${
            value === k
              ? 'border-brand-red bg-brand-red/10 text-brand-red shadow-sm'
              : 'border-border bg-white hover:bg-muted/40 text-brand-dark'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function PromoDialog({
  rule,
  onClose,
  onSave,
}: {
  rule?: Rule;
  onClose: () => void;
  onSave: (r: Rule) => void;
}) {
  const isEdit = !!rule;
  const [f, setF] = useState<Rule>({
    id: rule?.id ?? '',
    nameAr: rule?.nameAr ?? '',
    isActive: rule?.isActive ?? true,
    rewardType: rule?.rewardType ?? 'FREE_DELIVERY',
    rewardValue: rule?.rewardValue != null ? String(rule.rewardValue) : '',
    audience: rule?.audience ?? 'FIRST_ORDER',
    scheduleType: rule?.scheduleType ?? 'ALWAYS',
    dateFrom: rule?.dateFrom ?? '',
    dateTo: rule?.dateTo ?? '',
    dates: rule?.dates ?? [],
    weekdays: rule?.weekdays ?? [],
    minOrderAmount: rule?.minOrderAmount != null ? String(rule.minOrderAmount) : '',
    maxDiscount: rule?.maxDiscount != null ? String(rule.maxDiscount) : '',
    excludeIntercity: rule?.excludeIntercity ?? true,
    usageLimitTotal: rule?.usageLimitTotal != null ? String(rule.usageLimitTotal) : '',
    usageLimitPerCustomer:
      rule?.usageLimitPerCustomer != null ? String(rule.usageLimitPerCustomer) : '',
    priority: rule?.priority ?? 0,
  });
  const set = (patch: Partial<Rule>) => setF((prev: Rule) => ({ ...prev, ...patch }));
  const needsValue = f.rewardType !== 'FREE_DELIVERY';

  const err =
    f.nameAr.trim().length < 2
      ? 'اكتب اسم للعرض'
      : needsValue && !(Number(f.rewardValue) > 0)
        ? 'اكتب قيمة الخصم'
        : f.rewardType === 'DELIVERY_PERCENT' && Number(f.rewardValue) > 100
          ? 'النسبة مينفعش تزيد عن 100'
          : f.scheduleType === 'SPECIFIC_DATES' && !(f.dates ?? []).filter(Boolean).length
            ? 'ضيف يوم واحد على الأقل'
            : f.scheduleType === 'WEEKLY' && !(f.weekdays ?? []).length
              ? 'اختر يوم من أيام الأسبوع'
              : f.scheduleType === 'DATE_RANGE' && !f.dateFrom && !f.dateTo
                ? 'حدّد بداية أو نهاية الفترة'
                : '';

  const summary = (() => {
    const who = f.audience === 'FIRST_ORDER' ? 'أول أوردر لعميل جديد' : 'أي أوردر';
    const reward =
      f.rewardType === 'FREE_DELIVERY'
        ? 'توصيل مجاني'
        : f.rewardType === 'DELIVERY_PERCENT'
          ? `خصم ${f.rewardValue || 0}٪ على التوصيل`
          : `خصم ${f.rewardValue || 0} ج.م على التوصيل`;
    const when =
      f.scheduleType === 'ALWAYS'
        ? 'دايمًا'
        : f.scheduleType === 'SPECIFIC_DATES'
          ? `في: ${(f.dates ?? []).filter(Boolean).join('، ') || '—'}`
          : f.scheduleType === 'WEEKLY'
            ? `كل: ${(f.weekdays ?? []).map((d: number) => WEEKDAYS[d]).join('، ') || '—'}`
            : `من ${f.dateFrom || '…'} لـ ${f.dateTo || '…'}`;
    const min = Number(f.minOrderAmount) > 0 ? ` (للطلبات فوق ${f.minOrderAmount} ج.م)` : '';
    return `${who} ياخد ${reward} ${when}${min}.`;
  })();

  const submit = () => {
    onSave({
      ...f,
      rewardValue: f.rewardValue === '' ? null : Number(f.rewardValue),
      minOrderAmount: f.minOrderAmount === '' ? null : Number(f.minOrderAmount),
      maxDiscount: f.maxDiscount === '' ? null : Number(f.maxDiscount),
      usageLimitTotal: f.usageLimitTotal === '' ? null : Number(f.usageLimitTotal),
      usageLimitPerCustomer:
        f.usageLimitPerCustomer === '' ? null : Number(f.usageLimitPerCustomer),
      priority: Number(f.priority) || 0,
      dates: (f.dates ?? []).filter(Boolean),
    });
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={isEdit ? 'تعديل العرض' : 'عرض جديد'}
      size="lg"
    >
      <div className="space-y-3.5">
        {!isEdit && (
          <div className="rounded-xl border border-brand-red/20 bg-brand-red/[0.03] p-3">
            <div className="text-[11px] font-black text-brand-red uppercase tracking-wide mb-2">
              ابدأ بقالب جاهز (وتقدر تعدّله)
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() =>
                    set({
                      dates: [],
                      weekdays: [],
                      dateFrom: '',
                      dateTo: '',
                      rewardValue: '',
                      ...p.patch,
                    })
                  }
                  className="px-3 py-2 rounded-lg border border-brand-red/30 bg-white text-brand-red text-xs font-bold hover:bg-brand-red/5 shadow-sm"
                >
                  {p.emoji} {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <Field label="اسم العرض" required hint="بيظهر لك، وممكن يظهر للعميل">
          <Input
            value={f.nameAr}
            onChange={(e) => set({ nameAr: e.target.value })}
            placeholder="أول أوردر توصيل مجاني"
          />
        </Field>

        <Card title="المكافأة">
          <Seg
            value={f.rewardType}
            onChange={(v) => set({ rewardType: v })}
            options={Object.entries(REWARD_LABEL)}
          />
          {needsValue && (
            <div className="grid grid-cols-2 gap-3">
              <Field
                label={f.rewardType === 'DELIVERY_PERCENT' ? 'النسبة %' : 'المبلغ ج.م'}
                required
              >
                <Input
                  type="number"
                  value={f.rewardValue}
                  onChange={(e) => set({ rewardValue: e.target.value })}
                />
              </Field>
              <Field label="سقف الخصم" hint="اختياري">
                <Input
                  type="number"
                  value={f.maxDiscount}
                  onChange={(e) => set({ maxDiscount: e.target.value })}
                  placeholder="بدون"
                />
              </Field>
            </div>
          )}
        </Card>

        <Card title="لمين ومتى">
          <div>
            <div className="text-xs font-bold text-muted-foreground mb-1.5">لمين؟</div>
            <Seg
              value={f.audience}
              onChange={(v) => set({ audience: v })}
              options={Object.entries(AUDIENCE_LABEL)}
            />
          </div>
          <div>
            <div className="text-xs font-bold text-muted-foreground mb-1.5">التوقيت</div>
            <Seg
              value={f.scheduleType}
              onChange={(v) => set({ scheduleType: v })}
              options={Object.entries(SCHEDULE_LABEL)}
            />
          </div>

          {f.scheduleType === 'DATE_RANGE' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="من">
                <Input
                  type="date"
                  value={f.dateFrom}
                  onChange={(e) => set({ dateFrom: e.target.value })}
                />
              </Field>
              <Field label="إلى">
                <Input
                  type="date"
                  value={f.dateTo}
                  onChange={(e) => set({ dateTo: e.target.value })}
                />
              </Field>
            </div>
          )}

          {f.scheduleType === 'SPECIFIC_DATES' && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-muted-foreground">الأيام المجانية</div>
              {(f.dates ?? []).map((d: string, i: number) => (
                <div key={i} className="flex gap-2">
                  <Input
                    type="date"
                    value={d}
                    onChange={(e) => {
                      const dates = [...f.dates];
                      dates[i] = e.target.value;
                      set({ dates });
                    }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      set({ dates: f.dates.filter((_: string, j: number) => j !== i) })
                    }
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() => set({ dates: [...(f.dates ?? []), todayISO()] })}
              >
                <Plus className="w-4 h-4" /> إضافة يوم
              </Button>
            </div>
          )}

          {f.scheduleType === 'WEEKLY' && (
            <div>
              <div className="text-xs font-bold text-muted-foreground mb-1.5">أيام الأسبوع</div>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((w, i) => {
                  const on = (f.weekdays ?? []).includes(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() =>
                        set({
                          weekdays: on
                            ? f.weekdays.filter((d: number) => d !== i)
                            : [...(f.weekdays ?? []), i],
                        })
                      }
                      className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition ${
                        on
                          ? 'border-brand-red bg-brand-red/10 text-brand-red'
                          : 'border-border bg-white hover:bg-muted/40'
                      }`}
                    >
                      {w}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        <Card title="شروط وحدود (اختياري)">
          <div className="grid grid-cols-2 gap-3">
            <Field label="الحد الأدنى للطلب">
              <Input
                type="number"
                value={f.minOrderAmount}
                onChange={(e) => set({ minOrderAmount: e.target.value })}
                placeholder="بدون"
              />
            </Field>
            <Field label="الأولوية" hint="الأعلى يكسب">
              <Input
                type="number"
                value={f.priority}
                onChange={(e) => set({ priority: e.target.value })}
              />
            </Field>
            <Field label="حد الاستخدام الكلي">
              <Input
                type="number"
                value={f.usageLimitTotal}
                onChange={(e) => set({ usageLimitTotal: e.target.value })}
                placeholder="بلا حد"
              />
            </Field>
            <Field label="حد لكل عميل">
              <Input
                type="number"
                value={f.usageLimitPerCustomer}
                onChange={(e) => set({ usageLimitPerCustomer: e.target.value })}
                placeholder="بلا حد"
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={!!f.excludeIntercity}
              onChange={(e) => set({ excludeIntercity: e.target.checked })}
              className="h-4 w-4 accent-brand-red"
            />
            <span>
              استثناء أوردرات «من قنا» (الترحيل) — <b>مُوصى به</b>
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={!!f.isActive}
              onChange={(e) => set({ isActive: e.target.checked })}
              className="h-4 w-4 accent-brand-red"
            />
            <span>مفعّل</span>
          </label>
        </Card>
      </div>

      {/* footer ثابت أسفل النافذة: الملخّص + الأزرار */}
      <div className="sticky bottom-0 -mx-6 -mb-6 mt-4 px-6 pt-3 pb-5 bg-white border-t border-border">
        <div className="rounded-lg bg-brand-red/[0.06] border border-brand-red/15 px-3 py-2 text-sm text-brand-dark leading-relaxed mb-3">
          <span className="font-black">الملخّص: </span>
          {summary}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-destructive font-bold">{err}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="md" onClick={onClose}>
              إلغاء
            </Button>
            <Button onClick={() => !err && submit()} disabled={!!err}>
              {isEdit ? 'حفظ التعديل' : 'إنشاء العرض'}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
