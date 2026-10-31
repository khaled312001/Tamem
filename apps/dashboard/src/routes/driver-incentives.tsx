import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Save, Trash2, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button.js';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';

export interface IncentiveRules {
  enabled: boolean;
  effectiveFrom: string;
  bonusTiers: { orders: number; amount: number }[];
  lateGraceMin: number;
  latePerHour: number;
  absenceAfterMin: number;
  absenceAmount: number;
}

const money = (v: number) => `${Number(v || 0).toLocaleString('ar-EG')} ج`;

/** What a given lateness costs under the rules — mirrors driverIncentives() in api.php. */
export function lateCost(
  r: IncentiveRules,
  minutes: number,
): { kind: 'none' | 'late' | 'absent'; amount: number } {
  if (minutes > r.absenceAfterMin) return { kind: 'absent', amount: r.absenceAmount };
  if (minutes >= r.lateGraceMin && minutes > 0)
    return { kind: 'late', amount: Math.ceil(minutes / 60) * r.latePerHour };
  return { kind: 'none', amount: 0 };
}

/**
 * «البونص والخصومات» — the rules behind the driver's daily bonus and the
 * lateness / absence deductions. The amounts themselves show up in the driver
 * report, in the settlement, and in the driver's «حسابي» on Telegram.
 */
export function IncentiveRulesPanel() {
  const qc = useQueryClient();
  const role = useAuth((s) => (s.user as { role?: string } | null)?.role);
  const canEdit = role === 'SUPER_ADMIN';
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'driver-incentives'],
    queryFn: () => api.adminDriverIncentives() as Promise<{ rules: IncentiveRules; today: string }>,
  });
  const [r, setR] = useState<IncentiveRules | null>(null);
  useEffect(() => {
    if (data?.rules) setR(data.rules);
  }, [data]);

  const save = useMutation({
    mutationFn: (rules: IncentiveRules) =>
      api.adminSaveDriverIncentives(rules) as Promise<{ rules: IncentiveRules }>,
    onSuccess: (res) => {
      setR(res.rules);
      qc.invalidateQueries({ queryKey: ['admin', 'driver-incentives'] });
      qc.invalidateQueries({ queryKey: ['admin', 'reports', 'drivers'] });
      toast.success('اتحفظت القواعد');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !r) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const set = (patch: Partial<IncentiveRules>) => setR({ ...r, ...patch });
  const num = (v: string) => (v === '' ? 0 : Number(v));
  const field =
    'w-24 rounded-lg border border-input bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-red/20 disabled:bg-muted';
  const examples = [20, 45, 70, 130, 175, 200].map((m) => ({ m, c: lateCost(r, m) }));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <label className="flex items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            checked={r.enabled}
            disabled={!canEdit}
            onChange={(e) => set({ enabled: e.target.checked })}
            className="h-4 w-4 accent-brand-red"
          />
          تشغيل البونص والخصومات
        </label>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">بيبدأ الحساب من يوم</span>
          <input
            type="date"
            value={r.effectiveFrom}
            disabled={!canEdit}
            onChange={(e) => e.target.value && set({ effectiveFrom: e.target.value })}
            className="rounded-lg border border-input bg-white px-2 py-1.5 text-sm disabled:bg-muted"
          />
          <span className="text-xs text-muted-foreground">
            الأيام اللي قبله مش بيتحسب فيها بونص ولا خصم.
          </span>
        </label>
        <p className="text-xs text-muted-foreground">
          يوم المندوب من ٣ الفجر لـ٣ الفجر، عشان ورديات الليل اللي بتعدّي ١٢ تفضل يوم واحد.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h3 className="flex items-center gap-2 font-black">
          <Trophy className="h-4 w-4 text-amber-500" /> البونص اليومي
        </h3>
        <p className="text-xs text-muted-foreground">
          المندوب بياخد بونص أعلى مستوى وصله في اليوم (مش بيتجمعوا)، وبيتخصم من نصيب الشركة. أول ما
          يوصل للمستوى بتوصله رسالة على تليجرام.
        </p>
        <div className="space-y-2">
          {r.bonusTiers.map((t, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <span>لما يوصّل</span>
              <input
                type="number"
                min={1}
                value={t.orders}
                disabled={!canEdit}
                onChange={(e) => {
                  const b = [...r.bonusTiers];
                  b[i] = { ...t, orders: num(e.target.value) };
                  set({ bonusTiers: b });
                }}
                className={field}
              />
              <span>أوردر ← بونص</span>
              <input
                type="number"
                min={1}
                value={t.amount}
                disabled={!canEdit}
                onChange={(e) => {
                  const b = [...r.bonusTiers];
                  b[i] = { ...t, amount: num(e.target.value) };
                  set({ bonusTiers: b });
                }}
                className={field}
              />
              <span>ج</span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => set({ bonusTiers: r.bonusTiers.filter((_, j) => j !== i) })}
                  className="rounded p-1 text-muted-foreground hover:text-destructive"
                  aria-label="حذف المستوى"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                const last = r.bonusTiers[r.bonusTiers.length - 1];
                set({
                  bonusTiers: [
                    ...r.bonusTiers,
                    { orders: (last?.orders ?? 15) + 5, amount: (last?.amount ?? 30) + 20 },
                  ],
                });
              }}
              className="inline-flex items-center gap-1 text-sm font-bold text-brand-red"
            >
              <Plus className="h-4 w-4" /> مستوى جديد
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h3 className="font-black">التأخير والغياب</h3>
        <p className="text-xs text-muted-foreground">
          بيتقارن أول حضور للمندوب («حضرت» على تليجرام، أو أول حركة له على أوردر لو نسي) بمعاد أول
          وردية ليه في «الجدول الأسبوعي». الأيام اللي مالهاش وردية مفيهاش خصم.
        </p>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <label className="flex flex-wrap items-center gap-2">
            <span>مفيش خصم لو التأخير أقل من</span>
            <input
              type="number"
              min={0}
              value={r.lateGraceMin}
              disabled={!canEdit}
              onChange={(e) => set({ lateGraceMin: num(e.target.value) })}
              className={field}
            />
            <span>دقيقة</span>
          </label>
          <label className="flex flex-wrap items-center gap-2">
            <span>خصم كل ساعة تأخير (أو جزء منها)</span>
            <input
              type="number"
              min={0}
              value={r.latePerHour}
              disabled={!canEdit}
              onChange={(e) => set({ latePerHour: num(e.target.value) })}
              className={field}
            />
            <span>ج</span>
          </label>
          <label className="flex flex-wrap items-center gap-2">
            <span>يتحسب غياب بعد</span>
            <input
              type="number"
              min={1}
              value={r.absenceAfterMin}
              disabled={!canEdit}
              onChange={(e) => set({ absenceAfterMin: num(e.target.value) })}
              className={field}
            />
            <span>دقيقة تأخير</span>
          </label>
          <label className="flex flex-wrap items-center gap-2">
            <span>خصم الغياب</span>
            <input
              type="number"
              min={0}
              value={r.absenceAmount}
              disabled={!canEdit}
              onChange={(e) => set({ absenceAmount: num(e.target.value) })}
              className={field}
            />
            <span>ج</span>
          </label>
        </div>
        <div className="rounded-lg bg-muted/50 p-3 text-xs">
          <div className="mb-1 font-bold">أمثلة بالقواعد دي:</div>
          <div className="grid gap-1 sm:grid-cols-3">
            {examples.map(({ m, c }) => (
              <div key={m}>
                تأخير {m} دقيقة ←{' '}
                {c.kind === 'none' ? (
                  <span className="text-emerald-700">مفيش خصم</span>
                ) : c.kind === 'late' ? (
                  <span className="text-destructive">خصم {money(c.amount)}</span>
                ) : (
                  <span className="font-bold text-destructive">غياب {money(c.amount)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          غياب بإذن أو تأخير بعذر؟ افتح «التقارير ← السائقون ← اسم المندوب» واضغط «إعفاء» على اليوم.
        </p>
      </div>

      {canEdit ? (
        <div className="flex justify-end">
          <Button onClick={() => save.mutate(r)} disabled={save.isPending}>
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            حفظ القواعد
          </Button>
        </div>
      ) : (
        <p className="text-center text-xs text-muted-foreground">تعديل القواعد لمدير النظام بس.</p>
      )}
    </div>
  );
}
