/**
 * «تقفيل المناديب» — each driver's work day, the way the accountant closes it.
 *
 * He hands the office ALL the cash he collected every day: the total (every fee at its
 * real price) less «المجاني» (what he didn't collect: free / discounted orders, the
 * pharmacy's). What the day leaves for him (his % of the total + bonus − deductions)
 * waits for his week (Tue → Mon), whose closing pays him. Every figure of the row can
 * be typed over, with a reason. Closing his day records the cash he handed in.
 */
import { useIsFetching, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Lock,
  LockOpen,
  Pencil,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  dayLabel,
  DayNav,
  downloadCsv,
  errMsg,
  ExportButtons,
  money,
  signed,
  type Meta,
} from '../components/accounting/kit.js';
import { Button } from '../components/ui/Button.js';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js';
import { Dialog } from '../components/ui/Dialog.js';
import { api } from '../lib/api.js';
import { cn } from '../lib/utils.js';

interface KindLine {
  auto: number;
  amount: number;
  edited: boolean;
  waived: boolean;
  note: string | null;
}
interface Extra {
  id: string;
  amount: number;
  note: string;
  byName: string | null;
  createdAt: string;
}
/** His % set by the accountant for one week (Tue → Mon); null = the % in his file. */
export interface WeekPct {
  pct: number;
  note: string | null;
  byName: string | null;
}
/** The figures of the row; `pct` is typed through his/the company's cell. */
export type Field =
  | 'total'
  | 'pct'
  | 'share'
  | 'company'
  | 'free'
  | 'bonus'
  | 'deduction'
  | 'remaining';
export type Figure = Exclude<Field, 'pct'>;
interface FigEdit {
  value: number;
  note: string | null;
  byName: string | null;
  at: string;
}
export interface Calc {
  total: number;
  pct: number;
  share: number;
  company: number;
  free: number;
  bonus: number;
  deduction: number;
  remaining: number;
  /** what remaining would be without a typed «المتبقي له» */
  remainingCalc: number;
  /** the cash he hands in */
  cash: number;
  /** remaining ± a short / extra hand-in of a closed day */
  owed: number;
  auto: Record<Figure | 'pct', number>;
  edits: Partial<Record<Field, FigEdit>>;
}
export interface Closing {
  expected: number;
  received: number | null;
  diff: number | null;
  owed?: number | null;
  remaining?: number | null;
  note: string | null;
  closedByName: string | null;
  closedAt: string;
  settled: boolean;
  changed: boolean;
}
export interface DriverDay {
  driverId: string;
  name: string;
  phone: string | null;
  orders: number;
  free: number;
  /** what the free / discounted orders cost the company (their real fee − what was charged) */
  freeCost: number;
  /** «صيدلية الطاهر» orders: the pharmacy pays their fees to the company, the driver never holds them */
  pharmacy: number;
  pharmacyFees: number;
  worth: number;
  cashFees: number;
  otherFees: number;
  /** his share as it stands on the orders (the week's % box) */
  share: number;
  pct: number | null;
  company: number;
  profilePct: number | null;
  weekPct: WeekPct | null;
  weekStart: string;
  weekClosed: { closedByName: string | null; closedAt: string } | null;
  bonus: KindLine & { tier: number | null; next: { orders: number; amount: number } | null };
  late: KindLine;
  absence: KindLine;
  attendance: {
    status: 'ontime' | 'late' | 'absent' | 'waiting' | 'off';
    schedStart: string | null;
    arrival: string | null;
    arrivalBy: 'checkin' | 'activity' | null;
    lateMin: number;
  } | null;
  extras: Extra[];
  extrasTotal: number;
  advances: number;
  calc: Calc;
  net: number;
  handOver: number;
  unpaidOrders: number;
  closing: Closing | null;
}
type Totals = Record<
  | 'total'
  | 'company'
  | 'share'
  | 'free'
  | 'bonus'
  | 'deduction'
  | 'remaining'
  | 'cash'
  | 'received'
  | 'diff'
  | 'owed',
  number
>;
interface Sheet {
  day: string;
  today: string;
  isFuture: boolean;
  locked: 'DAY' | 'MONTH' | null;
  editableFrom: string;
  editsReady: boolean;
  lines: DriverDay[];
  totals: { drivers: number; closed: number; orders: number; calc: Totals };
}

export const STATUS_AR: Record<string, string> = {
  ontime: 'في معاده',
  late: 'متأخر',
  absent: 'غياب',
  waiting: 'لسه ماوصلش',
  off: 'مش عليه وردية',
};
export const STATUS_TONE: Record<string, string> = {
  ontime: 'bg-emerald-100 text-emerald-800',
  late: 'bg-amber-100 text-amber-800',
  absent: 'bg-red-100 text-red-800',
  waiting: 'bg-sky-100 text-sky-800',
  off: 'bg-muted text-muted-foreground',
};
export const inputCls = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm';
export const pctLabel = (p: number | null) => (p === null ? '—' : `${Math.round(p * 100) / 100}%`);
const r2 = (n: number) => Math.round(n * 100) / 100;

export const FIG_LABEL: Record<Figure, string> = {
  total: 'الإجمالي',
  company: 'نسبة الشركة',
  share: 'نسبته',
  free: 'المجاني',
  bonus: 'بونص',
  deduction: 'خصم',
  remaining: 'المتبقي له',
};
const FIG_HINT: Record<Figure, string> = {
  total:
    'توصيل كل أوردراته بسعره الأصلي (المجاني كمان). لو فيه أوردرات متسجلتش اكتب الإجمالي الصح: نسبته بتتحسب عليه، والكاش المطلوب منه بيتغير بالفرق.',
  company: 'اللي الشركة بتاخده من الإجمالي، والباقي ليه.',
  share: 'نسبته من الإجمالي، والباقي للشركة.',
  free: 'التوصيل اللي ما اتحصلش منه كاش: الأوردرات المجانية أو بخصم وصيدلية الطاهر. بيتخصم من الكاش اللي يسلّمه، ومالوش دعوة بالمتبقي له.',
  bonus: 'بونص القواعد وأي إضافة.',
  deduction: 'خصم التأخير والغياب وأي خصم تاني.',
  remaining:
    'اللي فاضل له من اليوم ده، وبياخده آخر الأسبوع. لو كتبته بإيدك بيفضل كده لحد ما تعدّل أي رقم تاني في اليوم.',
};
/** Is this figure typed? His and the company's cells are one split (pct / share / company). */
export const figEdit = (c: Calc, f: Figure): FigEdit | undefined =>
  f === 'share' || f === 'company' ? (c.edits.pct ?? c.edits.share ?? c.edits.company) : c.edits[f];
const splitField = (c: Calc): Field | null =>
  c.edits.pct ? 'pct' : c.edits.share ? 'share' : c.edits.company ? 'company' : null;

/** يوم / أسبوع — the same tab, closed day by day or the whole week (Tue → Mon). */
export function ModeToggle({
  mode,
  onMode,
}: {
  mode: 'day' | 'week';
  onMode: (m: 'day' | 'week') => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-card p-0.5" data-print="hide">
      {(
        [
          ['day', 'يوم'],
          ['week', 'أسبوع'],
        ] as const
      ).map(([m, label]) => (
        <button
          key={m}
          onClick={() => onMode(m)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-bold transition',
            mode === m ? 'bg-brand-red text-white' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Why the cash he hands in isn't the whole total: wallet payments, the pharmacy's. */
export function OrdersNotes({
  l,
}: {
  l: Pick<DriverDay, 'free' | 'freeCost' | 'pharmacy' | 'pharmacyFees' | 'otherFees'>;
}) {
  const notes = [
    l.free > 0 &&
      `${l.free} أوردر مجاني أو بخصم: العميل مدفعش ${money(l.freeCost)} من توصيلهم. محسوبين في الإجمالي بسعرهم الأصلي ونسبته منهم عادي، والـ ${money(l.freeCost)} في «المجاني» بتتخصم من الكاش.`,
    l.pharmacy > 0 &&
      `${l.pharmacy} أوردر صيدلية الطاهر: رسومهم ${money(l.pharmacyFees)} الصيدلية بتدفعها للشركة، مش معاه، فهي في «المجاني». نسبته منهم عادي.`,
    l.otherFees > 0 &&
      `${money(l.otherFees)} توصيل اتدفعوا فودافون كاش أو إنستاباي للشركة على طول، مش معاه.`,
  ].filter((x): x is string => !!x);
  if (!notes.length) return null;
  return (
    <ul className="space-y-0.5 text-xs text-muted-foreground">
      {notes.map((n) => (
        <li key={n}>• {n}</li>
      ))}
    </ul>
  );
}

/**
 * His % of the delivery fees and the company's, editable for his whole week (Tue → Mon).
 * Saving writes it on the week's unpaid orders, so every report reads the same split.
 */
export function SplitBox({
  driverId,
  week,
  pct,
  profilePct,
  weekPct,
  editable,
  whyNot,
}: {
  driverId: string;
  week: string;
  pct: number | null;
  profilePct: number | null;
  weekPct: WeekPct | null;
  editable: boolean;
  whyNot?: string | null;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(weekPct?.pct ?? pct ?? profilePct ?? 0));
  const [note, setNote] = useState(weekPct?.note ?? '');
  const [toProfile, setToProfile] = useState(false);
  const save = useMutation({
    mutationFn: (v: { pct: number | null; note?: string; saveToProfile?: boolean }) =>
      api.raw.post('/admin/accounting/drivers-week/share', { driverId, week, ...v }),
    onSuccess: (r) => {
      const d = r.data.data as { pct: number; orders: number; keptPaid: number };
      toast.success(
        `اتحسب ${d.orders} أوردر بنسبة ${pctLabel(d.pct)}` +
          (d.keptPaid ? ` (و${d.keptPaid} اتصرفوا قبل كده فضلوا زي ما هم)` : ''),
      );
      setEditing(false);
      qc.invalidateQueries({ queryKey: ['acct'] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const n = Number(val);
  const ok = val !== '' && n >= 0 && n <= 100;
  return (
    <section className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-black">نسبته للأسبوع كله</p>
          <p className="mt-1 text-sm tabular-nums">
            <span className="font-black text-emerald-700">نسبته {pctLabel(pct)}</span>
            <span className="mx-2 text-muted-foreground">·</span>
            <span className="font-black">
              الشركة {pct === null ? '—' : pctLabel(Math.round((100 - pct) * 100) / 100)}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {weekPct ? (
              <>
                <span className="me-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                  معدّلة للأسبوع
                </span>
                {weekPct.note && `${weekPct.note} · `}
                {weekPct.byName && `${weekPct.byName} · `}
                نسبته في ملفه {pctLabel(profilePct)}
              </>
            ) : (
              <>من ملفه ({pctLabel(profilePct)})</>
            )}
          </p>
        </div>
        {editable && !editing && (
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" /> عدّل النسبة
            </Button>
            {weekPct && (
              <Button
                size="sm"
                variant="ghost"
                disabled={save.isPending}
                onClick={() => save.mutate({ pct: null })}
              >
                <RotateCcw className="h-3.5 w-3.5" /> رجّع نسبة ملفه
              </Button>
            )}
          </div>
        )}
      </div>
      {!editable && whyNot && <p className="text-xs text-muted-foreground">{whyNot}</p>}
      {editing && (
        <div className="space-y-2 rounded-lg bg-muted/30 p-2">
          <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
            <label className="block text-xs font-bold">
              نسبته %
              <input
                type="number"
                min={0}
                max={100}
                inputMode="decimal"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                className={cn(inputCls, 'mt-1')}
                aria-label="نسبته"
              />
            </label>
            <label className="block text-xs font-bold">
              الاتفاق (اختياري)
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={255}
                placeholder="مثلاً: اتفاق نص بنص"
                className={cn(inputCls, 'mt-1')}
              />
            </label>
          </div>
          {ok && <p className="text-xs tabular-nums">والشركة {pctLabel(r2(100 - n))}</p>}
          <label className="flex items-center gap-2 text-xs font-bold">
            <input
              type="checkbox"
              checked={toProfile}
              onChange={(e) => setToProfile(e.target.checked)}
            />
            واحفظها في ملفه للأوردرات الجاية كمان
          </label>
          <p className="text-xs text-muted-foreground">
            النسبة دي بتتحسب على كل أوردرات أسبوعه (من الثلاثاء للاتنين) اللي لسه ماتصرفتش، ولو
            اتفاقه مبلغ ثابت خلّي نسبته 0 وحط المبلغ في البونص.
          </p>
          <div className="flex gap-1">
            <Button
              size="sm"
              disabled={!ok || save.isPending}
              onClick={() => save.mutate({ pct: n, note: note.trim(), saveToProfile: toProfile })}
            >
              {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} حفظ
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              إلغاء
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
const hm = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('ar-EG', {
    hour: 'numeric',
    minute: '2-digit',
  });
};
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('ar-EG', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Africa/Cairo',
  });
/** The Cairo calendar day of an instant (work days run midnight → midnight since 2026-11-14). */
const cairoDay = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date(iso));

function useSheet(day: string) {
  return useQuery({
    queryKey: ['acct', 'drivers-day', day],
    queryFn: () =>
      api.raw
        .get('/admin/accounting/drivers-day', { params: { date: day } })
        .then((r) => r.data.data as Sheet),
  });
}

/** How a figure reads in the row: «—» for an empty bonus / deduction / free. */
export function figText(f: Figure, v: number) {
  if ((f === 'bonus' || f === 'deduction' || f === 'free') && Math.abs(v) < 0.005) return '—';
  if (f === 'bonus') return `+${money(v)}`;
  if (f === 'deduction') return `−${money(v)}`;
  if (f === 'remaining') return signed(v);
  return money(v);
}
export const FIG_TONE: Partial<Record<Figure, string>> = {
  share: 'text-emerald-700',
  bonus: 'text-emerald-700',
  free: 'text-amber-700',
  deduction: 'text-destructive',
  remaining: 'font-black',
};

/** A figure in the table: tap to type over it (when the day is open). */
function FigureCell({
  c,
  f,
  sub,
  onEdit,
}: {
  c: Calc;
  f: Figure;
  sub?: string | null;
  onEdit: (() => void) | null;
}) {
  const e = figEdit(c, f);
  const body = (
    <>
      <span className={FIG_TONE[f]}>{figText(f, c[f])}</span>
      {e && <Pencil className="ms-1 inline h-3 w-3 text-amber-600" />}
      {sub && <span className="block text-[11px] font-normal text-muted-foreground">{sub}</span>}
    </>
  );
  return (
    <td
      className="px-1.5 py-1.5"
      onClick={(ev) => {
        if (onEdit) ev.stopPropagation();
      }}
    >
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          title={e?.note ? `${FIG_LABEL[f]}: ${e.note}` : `عدّل ${FIG_LABEL[f]}`}
          className="w-full rounded-md px-1.5 py-1 text-start tabular-nums ring-amber-300 hover:bg-amber-50 hover:ring-1"
        >
          {body}
        </button>
      ) : (
        <span className="block px-1.5 py-1 tabular-nums">{body}</span>
      )}
    </td>
  );
}

export function DriversDayTab({
  meta,
  day,
  onDay,
  onMode,
}: {
  meta: Meta;
  day: string;
  onDay: (v: string) => void;
  onMode: (m: 'day' | 'week') => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useSheet(day);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; f: Figure } | null>(null);
  const [askAll, setAskAll] = useState(false);
  const closeAll = useMutation({
    mutationFn: () => api.raw.post('/admin/accounting/drivers-day/close-all', { day }),
    onSuccess: (r) => {
      toast.success(`اتقفل ${(r.data.data as { closed: number }).closed} مندوب`);
      qc.invalidateQueries({ queryKey: ['acct'] });
      setAskAll(false);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const canEdit = (l: DriverDay) =>
    !!data &&
    !data.locked &&
    !data.isFuture &&
    !l.closing &&
    !l.weekClosed &&
    data.editsReady &&
    day >= data.editableFrom;
  const open = data?.lines.filter(
    (l) =>
      !l.closing &&
      !l.weekClosed &&
      (l.orders > 0 || Math.abs(l.net) >= 0.01 || Math.abs(l.handOver) >= 0.01),
  );
  const csv = () =>
    data &&
    downloadCsv(`تقفيل المناديب ${day}`, [
      ['تقفيل المناديب', day],
      [],
      [
        'المندوب',
        'طلبات',
        'مجاني',
        'صيدلية',
        'الإجمالي',
        'نسبة الشركة',
        'نسبته %',
        'نسبته',
        'المجاني',
        'بونص',
        'خصم',
        'المتبقي له',
        'يسلّم كاش',
        'سلّم',
        'ناقص / زيادة',
        'الحالة',
      ],
      ...data.lines.map((l) => [
        l.name,
        l.orders,
        l.free,
        l.pharmacy,
        l.calc.total,
        l.calc.company,
        l.calc.pct,
        l.calc.share,
        l.calc.free,
        l.calc.bonus,
        l.calc.deduction,
        l.calc.remaining,
        l.calc.cash,
        l.closing ? (l.closing.received ?? l.closing.expected) : '',
        l.closing?.diff ?? '',
        l.closing ? 'اتقفل' : l.weekClosed ? 'اتقفل مع أسبوعه' : 'مفتوح',
      ]),
      [
        'الإجمالي',
        data.totals.orders,
        '',
        '',
        data.totals.calc.total,
        data.totals.calc.company,
        '',
        data.totals.calc.share,
        data.totals.calc.free,
        data.totals.calc.bonus,
        data.totals.calc.deduction,
        data.totals.calc.remaining,
        data.totals.calc.cash,
        data.totals.calc.received,
        data.totals.calc.diff,
        `${data.totals.closed} من ${data.totals.drivers}`,
      ],
    ]);

  const current = data?.lines.find((l) => l.driverId === openId) ?? null;
  const editLine = data?.lines.find((l) => l.driverId === editing?.id) ?? null;
  const t = data?.totals.calc;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <ModeToggle mode="day" onMode={onMode} />
          <DayNav value={day} onChange={onDay} max={meta.today} />
          <span className="font-black">{dayLabel(day)}</span>
        </div>
        <ExportButtons onCsv={csv} />
      </div>
      {isLoading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-brand-red" />
      ) : error || !data || !t ? (
        <p className="text-sm text-destructive">{errMsg(error)}</p>
      ) : (
        <>
          {data.locked && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">
              <Lock className="me-1 inline h-4 w-4" />{' '}
              {data.locked === 'MONTH' ? 'الشهر كله متقفل' : 'اليوم ده متقفل في «التقفيل اليومي»'}،
              مفيش تعديل على المناديب.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {[
              ['المناديب', `${data.totals.closed} من ${data.totals.drivers} اتقفلوا`],
              ['الإجمالي', money(t.total)],
              ['نسبة الشركة', money(t.company)],
              ['المتبقي للمناديب', signed(t.remaining)],
              ['الكاش المفروض يتسلّم', money(t.cash)],
              ['اتسلّم فعلاً', money(t.received)],
            ].map(([lb, v]) => (
              <div key={lb} className="rounded-xl border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">{lb}</p>
                <p className="mt-1 text-lg font-black tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            المندوب بيسلّم الكاش كله للمكتب كل يوم: الإجمالي − المجاني. المتبقي له = نسبته + البونص
            − الخصم، وبياخده آخر الأسبوع لما تقفّل أسبوعه. دوس على أي رقم عشان تعدّله، أو على اسم
            المندوب عشان تشوف تفاصيله وتقفّل يومه.
          </p>
          {data.lines.length === 0 ? (
            <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              مفيش مناديب اشتغلوا أو عليهم حاجة في اليوم ده.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full min-w-[1040px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr className="text-start">
                    {[
                      'المندوب',
                      'طلبات',
                      FIG_LABEL.total,
                      FIG_LABEL.company,
                      FIG_LABEL.share,
                      FIG_LABEL.free,
                      FIG_LABEL.bonus,
                      FIG_LABEL.deduction,
                      FIG_LABEL.remaining,
                      'يسلّم كاش',
                      '',
                    ].map((h, i) => (
                      <th key={i} className="px-3 py-2 text-start font-bold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((l) => {
                    const ed = (f: Figure) =>
                      canEdit(l) ? () => setEditing({ id: l.driverId, f }) : null;
                    return (
                      <tr
                        key={l.driverId}
                        onClick={() => setOpenId(l.driverId)}
                        className={cn(
                          'cursor-pointer border-t border-border/60 tabular-nums hover:bg-muted/30',
                          (l.closing || l.weekClosed) && 'bg-emerald-50/50',
                        )}
                      >
                        <td className="px-3 py-2">
                          <div className="font-bold">{l.name}</div>
                          {l.attendance && l.attendance.status !== 'off' && (
                            <span
                              className={cn(
                                'mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold',
                                STATUS_TONE[l.attendance.status],
                              )}
                            >
                              {STATUS_AR[l.attendance.status]}
                              {l.attendance.status === 'late' && ` ${l.attendance.lateMin} د`}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {l.orders}
                          {l.pharmacy > 0 && (
                            <span className="ms-1 text-xs text-muted-foreground">
                              ({l.pharmacy} صيدلية)
                            </span>
                          )}
                        </td>
                        <FigureCell c={l.calc} f="total" onEdit={ed('total')} />
                        <FigureCell
                          c={l.calc}
                          f="company"
                          sub={pctLabel(r2(100 - l.calc.pct))}
                          onEdit={ed('company')}
                        />
                        <FigureCell
                          c={l.calc}
                          f="share"
                          sub={pctLabel(l.calc.pct) + (l.weekPct ? ' · للأسبوع' : '')}
                          onEdit={ed('share')}
                        />
                        <FigureCell
                          c={l.calc}
                          f="free"
                          sub={l.free + l.pharmacy ? `${l.free + l.pharmacy} أوردر` : null}
                          onEdit={ed('free')}
                        />
                        <FigureCell c={l.calc} f="bonus" onEdit={ed('bonus')} />
                        <FigureCell c={l.calc} f="deduction" onEdit={ed('deduction')} />
                        <FigureCell c={l.calc} f="remaining" onEdit={ed('remaining')} />
                        <td className="px-3 py-2">
                          {money(l.calc.cash)}
                          {l.closing && (
                            <span
                              className={cn(
                                'block text-[11px]',
                                (l.closing.diff ?? 0) < 0 ? 'text-destructive' : 'text-emerald-700',
                              )}
                            >
                              سلّم {money(l.closing.received ?? l.closing.expected)}
                              {(l.closing.diff ?? 0) < -0.005 &&
                                ` · ناقص ${money(-(l.closing.diff ?? 0))}`}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          {l.weekClosed && !l.closing ? (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                              <CheckCircle2 className="h-3 w-3" /> اتقفل مع أسبوعه
                            </span>
                          ) : l.closing ? (
                            l.closing.changed ? (
                              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                                <AlertTriangle className="h-3 w-3" /> اتغير بعد التقفيل
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                                <CheckCircle2 className="h-3 w-3" /> اتقفل
                              </span>
                            )
                          ) : (
                            !data.locked &&
                            !data.isFuture && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setOpenId(l.driverId)}
                              >
                                قفّل
                              </Button>
                            )
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-border font-black tabular-nums">
                    <td className="px-3 py-2">الإجمالي</td>
                    <td className="px-3 py-2">{data.totals.orders}</td>
                    {(
                      [
                        'total',
                        'company',
                        'share',
                        'free',
                        'bonus',
                        'deduction',
                        'remaining',
                      ] as const
                    ).map((f) => (
                      <td key={f} className="px-3 py-2">
                        {figText(f, t[f])}
                      </td>
                    ))}
                    <td className="px-3 py-2">{money(t.cash)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {!data.locked && !data.isFuture && open && open.length > 0 && (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 text-sm"
              data-print="hide"
            >
              <span className="text-muted-foreground">
                فاضل {open.length} مندوب مفتوحين. «قفّل الكل» بيقفّلهم على إن كل واحد سلّم الكاش
                كله.
              </span>
              <Button onClick={() => setAskAll(true)} disabled={closeAll.isPending}>
                <CheckCircle2 className="h-4 w-4" /> قفّل الكل ({open.length})
              </Button>
            </div>
          )}
          <ConfirmDialog
            open={askAll}
            onOpenChange={setAskAll}
            title={`تقفّل ${open?.length ?? 0} مندوب؟`}
            message="كل مندوب هيتقفل على إنه سلّم الكاش كله، وأرقام يومه هتتثبت. اللي سلّم مبلغ مختلف قفّله لوحده من الجدول."
            confirmLabel="قفّل الكل"
            tone="primary"
            loading={closeAll.isPending}
            onConfirm={() => closeAll.mutate()}
          />
          {current && (
            <DriverDayDialog
              line={current}
              sheet={data}
              editable={canEdit(current)}
              onEdit={(f) => setEditing({ id: current.driverId, f })}
              onClose={() => setOpenId(null)}
            />
          )}
          {editing && editLine && (
            <FigureEditor
              key={`${editing.id}${editing.f}`}
              line={editLine}
              day={day}
              f={editing.f}
              onClose={() => setEditing(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────── typing over one figure ───────────────────────────
function FigureEditor({
  line: l,
  day,
  f,
  onClose,
}: {
  line: DriverDay;
  day: string;
  f: Figure;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const c = l.calc;
  const split = f === 'share' || f === 'company';
  const [mode, setMode] = useState<'amount' | 'pct'>('amount');
  const pctOf = (m: 'amount' | 'pct') =>
    m === 'pct' ? String(f === 'company' ? r2(100 - c.pct) : c.pct) : String(c[f]);
  const [val, setVal] = useState(pctOf('amount'));
  const [note, setNote] = useState(figEdit(c, f)?.note ?? '');
  const [week, setWeek] = useState(false);
  const [toProfile, setToProfile] = useState(false);
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.raw.post('/admin/accounting/drivers-day/edit', { driverId: l.driverId, day, ...body }),
    onSuccess: (r, body) => {
      const d = r.data.data as { orders?: number; pct?: number };
      toast.success(
        body.value === null
          ? 'رجع للمحسوب'
          : d.orders !== undefined
            ? `نسبته ${pctLabel(d.pct ?? 0)} على أسبوعه كله (${d.orders} أوردر)`
            : 'اتعدّل',
      );
      qc.invalidateQueries({ queryKey: ['acct'] });
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const n = Number(val);
  const ok =
    val !== '' &&
    !Number.isNaN(n) &&
    (f === 'remaining' || n >= 0) &&
    (mode === 'amount' || n <= 100);
  const edited = figEdit(c, f);
  const autoV = f === 'remaining' ? c.remainingCalc : c.auto[f];

  // what the row turns into (the server has the last word)
  let preview: string | null = null;
  if (ok) {
    if (split) {
      const his =
        mode === 'pct'
          ? r2((c.total * (f === 'share' ? n : 100 - n)) / 100)
          : f === 'share'
            ? n
            : r2(c.total - n);
      const p = c.total > 0 ? (his / c.total) * 100 : c.pct;
      preview = `نسبته ${money(his)} (${pctLabel(r2(p))}) · الشركة ${money(r2(c.total - his))}`;
    } else if (f === 'free') {
      preview = `الكاش المطلوب ${money(r2(Math.max(0, c.cash + c.free - n)))} · المتبقي له زي ما هو`;
    } else if (f === 'bonus') {
      preview = `المتبقي له ${signed(r2(c.remainingCalc - c.bonus + n))}`;
    } else if (f === 'deduction') {
      preview = `المتبقي له ${signed(r2(c.remainingCalc + c.deduction - n))}`;
    } else if (f === 'total') {
      preview = `نسبته ${money(r2((n * c.pct) / 100))} (${pctLabel(c.pct)}) · الشركة ${money(r2(n - (n * c.pct) / 100))} · الكاش المطلوب ${money(r2(Math.max(0, c.cash + n - c.total)))}`;
    }
  }
  const submit = () => {
    if (split && mode === 'pct') {
      const pct = f === 'share' ? n : r2(100 - n);
      save.mutate({
        field: 'pct',
        value: pct,
        note: note.trim(),
        week,
        saveToProfile: week && toProfile,
      });
    } else {
      save.mutate({ field: f, value: n, note: note.trim() });
    }
  };
  const reset = () => {
    const field = split ? splitField(c) : f;
    if (field) save.mutate({ field, value: null });
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${FIG_LABEL[f]} · ${l.name}`}
      size="sm"
    >
      <div className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">{FIG_HINT[f]}</p>
        <p className="tabular-nums">
          دلوقتي <b>{figText(f, c[f])}</b>
          {split && (
            <span className="text-muted-foreground">
              {' '}
              ({pctLabel(f === 'share' ? c.pct : r2(100 - c.pct))})
            </span>
          )}
          {edited && (
            <span className="ms-2 text-xs text-muted-foreground">
              المحسوب {figText(f, autoV)}
              {edited.byName && ` · عدّله ${edited.byName}`}
            </span>
          )}
        </p>
        {split && (
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {(
              [
                ['amount', 'بالمبلغ'],
                ['pct', 'بالنسبة %'],
              ] as const
            ).map(([m, t]) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setVal(pctOf(m));
                }}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-bold',
                  mode === m ? 'bg-brand-red text-white' : 'text-muted-foreground',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-[130px_1fr]">
          <input
            type="number"
            inputMode="decimal"
            autoFocus
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ok && !save.isPending && submit()}
            className={inputCls}
            aria-label={`${FIG_LABEL[f]} الجديد`}
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="السبب (اختياري)"
            maxLength={255}
            className={inputCls}
          />
        </div>
        {split && mode === 'pct' && (
          <div className="space-y-1 rounded-lg bg-muted/30 p-2 text-xs font-bold">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={week} onChange={(e) => setWeek(e.target.checked)} />
              على أسبوعه كله (من الثلاثاء للاتنين)
            </label>
            {week && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={toProfile}
                  onChange={(e) => setToProfile(e.target.checked)}
                />
                واحفظها في ملفه للأوردرات الجاية كمان
              </label>
            )}
          </div>
        )}
        {preview && <p className="text-xs font-bold tabular-nums text-brand-dark">{preview}</p>}
        <div className="flex flex-wrap gap-1">
          <Button size="sm" disabled={!ok || save.isPending} onClick={submit}>
            {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} حفظ
          </Button>
          {edited && (
            <Button size="sm" variant="ghost" disabled={save.isPending} onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" /> رجّع المحسوب
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** The seven figures as tiles (the driver's dialog); tap one to type over it. */
export function FigureTiles({
  c,
  freeCount,
  onEdit,
}: {
  c: Calc;
  freeCount: number;
  onEdit: ((f: Figure) => void) | null;
}) {
  const subs: Partial<Record<Figure, string>> = {
    company: pctLabel(r2(100 - c.pct)),
    share: pctLabel(c.pct),
    free: freeCount ? `${freeCount} أوردر` : undefined,
  };
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {(['total', 'company', 'share', 'free', 'bonus', 'deduction', 'remaining'] as const).map(
        (f) => {
          const e = figEdit(c, f);
          const inner = (
            <>
              <p className="text-[11px] text-muted-foreground">
                {FIG_LABEL[f]}
                {subs[f] && ` · ${subs[f]}`}
              </p>
              <p
                className={cn(
                  'font-black tabular-nums',
                  FIG_TONE[f],
                  f === 'remaining' && 'text-lg',
                )}
              >
                {figText(f, c[f])}
                {e && <Pencil className="ms-1 inline h-3 w-3 text-amber-600" />}
              </p>
              {e?.note && <p className="truncate text-[11px] text-amber-800">{e.note}</p>}
            </>
          );
          const cls = cn(
            'rounded-lg p-2 text-start',
            f === 'remaining' ? 'col-span-2 bg-brand-red/[0.06] sm:col-span-1' : 'bg-muted/40',
          );
          return onEdit ? (
            <button
              key={f}
              type="button"
              onClick={() => onEdit(f)}
              className={cn(cls, 'ring-amber-300 hover:ring-1')}
            >
              {inner}
            </button>
          ) : (
            <div key={f} className={cls}>
              {inner}
            </div>
          );
        },
      )}
    </div>
  );
}

// ─────────────────────────── one driver's day ───────────────────────────
function DriverDayDialog({
  line: l,
  sheet,
  editable,
  onEdit,
  onClose,
}: {
  line: DriverDay;
  sheet: Sheet;
  editable: boolean;
  onEdit: (f: Figure) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const day = sheet.day;
  const done = () => qc.invalidateQueries({ queryKey: ['acct'] });
  const refreshing = useIsFetching({ queryKey: ['acct', 'drivers-day', day] });
  const whyNot = sheet.locked
    ? 'اليوم متقفل في الحسابات.'
    : l.closing
      ? 'يومه متقفل — افتحه الأول عشان تعدّل.'
      : l.weekClosed
        ? 'أسبوعه متقفل كله — افتحه من «أسبوع» عشان تعدّل.'
        : day < sheet.editableFrom
          ? `التعديل بيبدأ من ${sheet.editableFrom}.`
          : !sheet.editsReady
            ? 'التعديلات مش جاهزة على السيرفر.'
            : null;

  const delExtra = useMutation({
    mutationFn: (id: string) => api.raw.delete(`/admin/accounting/drivers-day/extra/${id}`),
    onSuccess: () => done(),
    onError: (e) => toast.error(errMsg(e)),
  });
  const close = useMutation({
    mutationFn: (v: { received: number | null; note: string }) =>
      api.raw.post('/admin/accounting/drivers-day/close', { driverId: l.driverId, day, ...v }),
    onSuccess: () => {
      toast.success(`اتقفل يوم ${l.name}`);
      done();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const reopen = useMutation({
    mutationFn: () => api.raw.delete(`/admin/accounting/drivers-day/close/${l.driverId}/${day}`),
    onSuccess: () => {
      toast.success('اتفتح للتعديل');
      done();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const a = l.attendance;
  const c = l.calc;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${l.name} · ${dayLabel(day)}`}
      size="lg"
    >
      <div className="space-y-4 text-sm">
        <p className="text-xs text-muted-foreground">
          {l.orders} أوردر
          {l.weekPct
            ? ` · نسبته في الأسبوع ${pctLabel(l.weekPct.pct)}${l.weekPct.note ? ` (${l.weekPct.note})` : ''}`
            : ` · نسبته في ملفه ${pctLabel(l.profilePct)}`}
          {editable && ' · دوس على أي رقم عشان تعدّله'}
        </p>
        <FigureTiles c={c} freeCount={l.free + l.pharmacy} onEdit={editable ? onEdit : null} />
        {a && a.status !== 'off' && (
          <p className="text-xs">
            <span className={cn('rounded-full px-2 py-0.5 font-bold', STATUS_TONE[a.status])}>
              {STATUS_AR[a.status]}
            </span>
            {a.schedStart && <span className="ms-2">معاده {hm(a.schedStart)}</span>}
            {a.arrival && (
              <span className="ms-2">
                وصل {clock(a.arrival)}
                {a.arrivalBy === 'activity' && ' (أول أوردر)'}
              </span>
            )}
            {a.status === 'late' && <span className="ms-2">اتأخر {a.lateMin} دقيقة</span>}
          </p>
        )}
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          <li>
            •{' '}
            {l.bonus.tier
              ? `بونص القواعد ${money(l.bonus.auto)} (وصل ${l.bonus.tier} أوردر)`
              : l.bonus.next
                ? `مفيش بونص (فاضله ${l.bonus.next.orders - l.orders} أوردر على ${money(l.bonus.next.amount)})`
                : 'مفيش بونص من القواعد'}
            {l.bonus.edited && ` · اتحدد ${money(l.bonus.amount)}`}
          </li>
          {(l.late.amount !== 0 || l.absence.amount !== 0) && (
            <li>
              • خصم من القواعد:
              {l.late.amount !== 0 && ` تأخير ${money(-l.late.amount)}`}
              {l.absence.amount !== 0 && ` غياب ${money(-l.absence.amount)}`}
            </li>
          )}
        </ul>
        <OrdersNotes l={l} />

        {l.extras.length > 0 && (
          <section className="space-y-1 rounded-xl border border-border p-3">
            <p className="text-xs font-black">
              خصم وإضافة متسجلين قبل كده (محسوبين في البونص والخصم)
            </p>
            <ul className="divide-y divide-border">
              {l.extras.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span>
                    <b className={x.amount < 0 ? 'text-destructive' : 'text-emerald-700'}>
                      {x.amount < 0 ? `خصم ${money(-x.amount)}` : `إضافة ${money(x.amount)}`}
                    </b>{' '}
                    · {x.note}
                    {x.byName && (
                      <span className="text-xs text-muted-foreground"> · {x.byName}</span>
                    )}
                  </span>
                  {editable && (
                    <button
                      type="button"
                      aria-label="امسح"
                      disabled={delExtra.isPending}
                      onClick={() => delExtra.mutate(x.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        {l.advances > 0 && (
          <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
            خد سلفة {money(l.advances)} اليوم ده (من «الحركات اليومية»). مش متخصومة هنا، لو هتخصمها
            من يومه زوّدها على الخصم.
          </p>
        )}

        <section className="rounded-xl border-2 border-brand-red/20 bg-brand-red/[0.03] p-3 tabular-nums">
          {[
            [`نسبته (${pctLabel(c.pct)})`, money(c.share)],
            ['البونص', c.bonus ? `+ ${money(c.bonus)}` : '0'],
            ['الخصم', c.deduction ? `− ${money(c.deduction)}` : '0'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between py-0.5">
              <span className="text-muted-foreground">{k}</span>
              <span>{v}</span>
            </div>
          ))}
          {figEdit(c, 'remaining') && (
            <div className="flex justify-between py-0.5 text-amber-800">
              <span>المحسوب {signed(c.remainingCalc)}، واتكتب بإيد</span>
              <span>{signed(r2(c.remaining - c.remainingCalc))}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-border pt-1.5 text-base font-black">
            <span>المتبقي له (بياخده آخر الأسبوع)</span>
            <span>{signed(c.remaining)}</span>
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card p-3 tabular-nums">
          {(
            [
              ['الإجمالي', money(c.total)],
              ['المجاني (ما اتحصلش منه كاش)', c.free ? `− ${money(c.free)}` : '0'],
              l.otherFees > 0 && ['اتدفع للشركة على طول (محفظة)', `− ${money(l.otherFees)}`],
            ].filter(Boolean) as [string, string][]
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between py-0.5">
              <span className="text-muted-foreground">{k}</span>
              <span>{v}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-border pt-1.5 text-base font-black">
            <span>يسلّم كاش للمكتب</span>
            <span>{money(c.cash)}</span>
          </div>
        </section>

        <OrdersList driverId={l.driverId} day={day} count={l.orders} />

        {l.closing ? (
          <ClosedBox
            c={l.closing}
            canReopen={!sheet.locked && !l.weekClosed}
            busy={reopen.isPending}
            onReopen={() => reopen.mutate()}
          />
        ) : l.weekClosed ? (
          <section className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
            <span className="inline-flex items-center gap-1.5 font-black">
              <Lock className="h-4 w-4" /> اليوم ده اتقفل مع أسبوعه
            </span>
            <p className="mt-1 text-xs">
              {l.weekClosed.closedByName && `${l.weekClosed.closedByName} · `}
              {new Date(l.weekClosed.closedAt).toLocaleString('ar-EG', {
                timeZone: 'Africa/Cairo',
              })}
              . عشان تعدّل افتح الأسبوع من «أسبوع».
            </p>
          </section>
        ) : sheet.locked || sheet.isFuture ? (
          whyNot && <p className="text-xs text-muted-foreground">{whyNot}</p>
        ) : (
          <CloseForm
            expected={c.cash}
            base={c.remaining}
            busy={close.isPending}
            // an edit still saving would close on old numbers
            waiting={delExtra.isPending || refreshing > 0}
            onClose={(v) => close.mutate(v)}
          />
        )}
        {!editable && !l.closing && whyNot && !sheet.locked && (
          <p className="text-xs text-muted-foreground">{whyNot}</p>
        )}
      </div>
    </Dialog>
  );
}

/** His orders of one day, or of his whole week when `week` is given (any day of it). */
export function OrdersList({
  driverId,
  day,
  week,
  count,
}: {
  driverId: string;
  day?: string;
  week?: string;
  count: number;
}) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['acct', 'drivers-day-orders', driverId, week ? `w${week}` : day],
    queryFn: () =>
      api.raw
        .get('/admin/accounting/drivers-day/orders', {
          params: week ? { driverId, week } : { driverId, date: day },
        })
        .then(
          (r) =>
            r.data.data.orders as {
              id: string;
              orderNumber: string;
              createdAt: string;
              cash: boolean;
              pharmacy: boolean;
              worth: number;
              charged: number;
              share: number;
              free: boolean;
              settled: boolean;
            }[],
        ),
    enabled: open,
  });
  if (!count) return null;
  return (
    <section className="rounded-xl border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between p-3 font-black"
      >
        طلباته ({count})
        <ChevronDown className={cn('h-4 w-4 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="max-h-64 overflow-y-auto border-t border-border px-3 pb-2">
          {isLoading || !data ? (
            <Loader2 className="mx-auto my-3 h-5 w-5 animate-spin text-brand-red" />
          ) : (
            <table className="w-full text-xs tabular-nums">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1.5 text-start">الطلب</th>
                  <th className="py-1.5 text-start">الساعة</th>
                  <th className="py-1.5 text-start">التوصيل</th>
                  <th className="py-1.5 text-start">اتدفع</th>
                  <th className="py-1.5 text-start">نصيبه</th>
                </tr>
              </thead>
              <tbody>
                {data.map((o) => (
                  <tr key={o.id} className="border-t border-border/50">
                    <td className="py-1">#{o.orderNumber}</td>
                    <td className="py-1">
                      {week && (
                        <span className="me-1 text-muted-foreground">
                          {dayLabel(cairoDay(o.createdAt))}
                        </span>
                      )}
                      {clock(o.createdAt)}
                    </td>
                    <td className="py-1">
                      {money(o.worth)}
                      {o.free && <span className="ms-1 text-emerald-700">مجاني</span>}
                    </td>
                    <td className="py-1">
                      {o.pharmacy
                        ? `${money(o.charged)} (على الصيدلية)`
                        : o.cash
                          ? money(o.charged)
                          : `${money(o.charged)} (محفظة)`}
                    </td>
                    <td className="py-1">{money(o.share)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Closing a day: the cash he handed in (what's short comes off what's left for him).
 * Closing a week (`week`): what the company paid him out of what the week left him.
 */
export function CloseForm({
  expected,
  base,
  busy,
  waiting,
  onClose,
  week = false,
}: {
  /** day: the cash he should hand in · week: what the company owes him */
  expected: number;
  /** day: what the day leaves for him */
  base?: number;
  busy: boolean;
  waiting: boolean;
  onClose: (v: { received: number | null; note: string }) => void;
  week?: boolean;
}) {
  // null = not typed yet: follow the figure (and let the server use its fresh number).
  // Once typed, a refresh never overwrites it; the line under it just follows the new number.
  const [typed, setTyped] = useState<string | null>(null);
  const received = typed ?? String(expected);
  const [note, setNote] = useState('');
  const diff = received === '' ? 0 : r2(Number(received) - expected);
  return (
    <section className="space-y-2 rounded-xl border border-emerald-300 bg-emerald-50/60 p-3">
      <p className="font-black">{week ? 'تقفيل أسبوعه: اديله فلوسه' : 'تقفيل يومه: استلم الكاش'}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs font-bold">
          {week
            ? `دفعناله (المستحق ${signed(expected)})`
            : `استلمنا منه كاش (المطلوب ${money(expected)})`}
          <input
            type="number"
            inputMode="decimal"
            value={received}
            onChange={(e) => setTyped(e.target.value)}
            className={cn(inputCls, 'mt-1')}
          />
        </label>
        <label className="block text-xs font-bold">
          ملاحظة (اختياري)
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            className={cn(inputCls, 'mt-1')}
          />
        </label>
      </div>
      {Math.abs(diff) >= 0.01 && (
        <p className={cn('text-xs font-bold', diff < 0 ? 'text-destructive' : 'text-emerald-700')}>
          {week
            ? diff < 0
              ? `لسه ليه ${money(-diff)} مادفعتهوش.`
              : `خد ${money(diff)} زيادة عن المستحق.`
            : diff < 0
              ? `ناقص ${money(-diff)}: هيتخصم من المتبقي له${base !== undefined ? `، فيبقى ${signed(r2(base + diff))}` : ''}.`
              : `زيادة ${money(diff)}: هتتضاف على المتبقي له${base !== undefined ? `، فيبقى ${signed(r2(base + diff))}` : ''}.`}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {week
          ? 'التقفيل بيصرف له فلوس الأسبوع: طلباته والبونص والخصم بيتعلّموا اتصرفوا، والأيام اللي لسه مفتوحة بتتحسب إنه سلّم الكاش كله. مفيش تعديل بعده إلا لو فتحته تاني.'
          : 'التقفيل بيثبّت أرقام اليوم، والمتبقي له بيتصرف مع تقفيل أسبوعه. مفيش تعديل بعده إلا لو فتحته تاني.'}
      </p>
      <Button
        disabled={busy || waiting || (received !== '' && Number.isNaN(Number(received)))}
        onClick={() =>
          onClose({ received: typed === null || received === '' ? null : Number(received), note })
        }
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{' '}
        {week ? 'قفّل أسبوعه' : 'قفّل يومه'}
      </Button>
    </section>
  );
}

export function ClosedBox({
  c,
  canReopen,
  busy,
  onReopen,
  week = false,
}: {
  c: Closing;
  canReopen: boolean;
  busy: boolean;
  onReopen: () => void;
  week?: boolean;
}) {
  const [ask, setAsk] = useState(false);
  const got = c.received ?? c.expected;
  const diff = c.diff ?? 0;
  return (
    <section className="space-y-1 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-emerald-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-black">
          <Lock className="h-4 w-4" /> {week ? 'أسبوعه متقفل' : 'يومه متقفل'}
        </span>
        {canReopen && (
          <Button size="sm" variant="outline" onClick={() => setAsk(true)}>
            <LockOpen className="h-4 w-4" /> افتحه للتعديل
          </Button>
        )}
      </div>
      <p className="text-xs tabular-nums">
        {week
          ? `المستحق ${signed(c.expected)} · اتدفعله ${signed(got)}${diff < -0.005 ? ` · لسه ليه ${money(-diff)}` : diff > 0.005 ? ` · خد زيادة ${money(diff)}` : ''}`
          : `سلّم كاش ${money(got)} من ${money(c.expected)}${diff < -0.005 ? ` · ناقص ${money(-diff)}` : diff > 0.005 ? ` · زيادة ${money(diff)}` : ''}${c.owed !== undefined && c.owed !== null ? ` · المتبقي له ${signed(c.owed)}` : ''}`}{' '}
        · {c.closedByName ?? 'مدير'} ·{' '}
        {new Date(c.closedAt).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}
      </p>
      {c.note && <p className="text-xs">ملاحظة: {c.note}</p>}
      {c.changed && (
        <p className="inline-flex items-center gap-1 text-xs font-bold text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5" /> فيه حاجة اتغيرت بعد التقفيل (طلب اتسلّم متأخر أو
          رقم اتعدّل). افتحه وقفّله تاني.
        </p>
      )}
      <ConfirmDialog
        open={ask}
        onOpenChange={setAsk}
        title={week ? 'تفتح أسبوع المندوب؟' : 'تفتح يوم المندوب؟'}
        message={
          week
            ? 'فلوس الأسبوع هترجع «لسه ماتصرفتش» لحد ما تقفّله تاني.'
            : 'أرقام اليوم هتتفتح للتعديل لحد ما تقفّله تاني.'
        }
        confirmLabel="افتحه"
        tone="primary"
        loading={busy}
        onConfirm={() => {
          onReopen();
          setAsk(false);
        }}
      />
    </section>
  );
}
