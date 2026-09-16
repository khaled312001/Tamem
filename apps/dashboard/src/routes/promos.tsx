import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
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
  DELIVERY_PERCENT: 'خصم نسبة على التوصيل',
  DELIVERY_FIXED: 'خصم مبلغ على التوصيل',
};
const AUDIENCE_LABEL: Record<string, string> = {
  ALL: 'كل العملاء',
  FIRST_ORDER: 'أول أوردر (عميل جديد)',
};
const SCHEDULE_LABEL: Record<string, string> = {
  ALWAYS: 'دائم',
  DATE_RANGE: 'فترة محددة',
  SPECIFIC_DATES: 'أيام محددة',
  WEEKLY: 'أسبوعي متكرر',
};
const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

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
      { onSuccess: () => toast.success('تم حذف العرض') },
    );
  const toggle = (id: string, isActive: boolean) =>
    save.mutate((rules ?? []).map((r) => (r.id === id ? { ...r, isActive } : r)));

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
  const set = (patch: Partial<Rule>) => setF({ ...f, ...patch });

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
  const canSave = f.nameAr.trim().length >= 2;
  const selCls = 'w-full px-3 py-2 rounded-lg border border-input bg-white text-sm';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={isEdit ? 'تعديل العرض' : 'عرض جديد'}>
      <div className="space-y-3 max-h-[70vh] overflow-y-auto pl-1">
        <Field label="اسم العرض" required hint="بيظهر لك، وممكن يظهر للعميل">
          <Input
            value={f.nameAr}
            onChange={(e) => set({ nameAr: e.target.value })}
            placeholder="أول أوردر توصيل مجاني"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="المكافأة" required>
            <select
              value={f.rewardType}
              onChange={(e) => set({ rewardType: e.target.value })}
              className={selCls}
            >
              {Object.entries(REWARD_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          {f.rewardType !== 'FREE_DELIVERY' && (
            <Field label={f.rewardType === 'DELIVERY_PERCENT' ? 'النسبة %' : 'المبلغ ج.م'} required>
              <Input
                type="number"
                value={f.rewardValue}
                onChange={(e) => set({ rewardValue: e.target.value })}
              />
            </Field>
          )}
        </div>

        <Field label="لمين؟" required>
          <select
            value={f.audience}
            onChange={(e) => set({ audience: e.target.value })}
            className={selCls}
          >
            {Object.entries(AUDIENCE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>

        <Field label="التوقيت" required>
          <select
            value={f.scheduleType}
            onChange={(e) => set({ scheduleType: e.target.value })}
            className={selCls}
          >
            {Object.entries(SCHEDULE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>

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
          <Field label="الأيام المجانية">
            <div className="space-y-2">
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
                onClick={() => set({ dates: [...(f.dates ?? []), ''] })}
              >
                <Plus className="w-4 h-4" /> إضافة يوم
              </Button>
            </div>
          </Field>
        )}

        {f.scheduleType === 'WEEKLY' && (
          <Field label="أيام الأسبوع">
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
                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${on ? 'border-brand-red bg-brand-red/5 text-brand-red' : 'border-border'}`}
                  >
                    {w}
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="الحد الأدنى للطلب" hint="اختياري">
            <Input
              type="number"
              value={f.minOrderAmount}
              onChange={(e) => set({ minOrderAmount: e.target.value })}
              placeholder="بدون"
            />
          </Field>
          {f.rewardType !== 'FREE_DELIVERY' && (
            <Field label="سقف الخصم" hint="اختياري">
              <Input
                type="number"
                value={f.maxDiscount}
                onChange={(e) => set({ maxDiscount: e.target.value })}
                placeholder="بدون"
              />
            </Field>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="حد الاستخدام الكلي" hint="اختياري">
            <Input
              type="number"
              value={f.usageLimitTotal}
              onChange={(e) => set({ usageLimitTotal: e.target.value })}
              placeholder="بلا حد"
            />
          </Field>
          <Field label="حد لكل عميل" hint="اختياري">
            <Input
              type="number"
              value={f.usageLimitPerCustomer}
              onChange={(e) => set({ usageLimitPerCustomer: e.target.value })}
              placeholder="بلا حد"
            />
          </Field>
        </div>

        <Field label="الأولوية" hint="الأعلى يكسب لو أكتر من عرض ينطبق">
          <Input
            type="number"
            value={f.priority}
            onChange={(e) => set({ priority: e.target.value })}
          />
        </Field>

        <label className="flex items-center gap-2 cursor-pointer text-sm py-1">
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
        <label className="flex items-center gap-2 cursor-pointer text-sm py-1">
          <input
            type="checkbox"
            checked={!!f.isActive}
            onChange={(e) => set({ isActive: e.target.checked })}
            className="h-4 w-4 accent-brand-red"
          />
          <span>مفعّل</span>
        </label>
      </div>

      <div className="flex justify-end gap-2 mt-4 border-t border-border pt-3">
        <Button variant="outline" size="md" onClick={onClose}>
          إلغاء
        </Button>
        <Button onClick={() => canSave && submit()} disabled={!canSave}>
          {isEdit ? 'حفظ' : 'إنشاء'}
        </Button>
      </div>
    </Dialog>
  );
}
