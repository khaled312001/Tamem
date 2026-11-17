/**
 * «تقفيل المناديب» by the week (Tue → Mon, like the shift schedule).
 *
 * Every driver's week added up from his days: the total, the company's and his
 * share, bonus, deductions and what each day left for him, less any cash he handed
 * in short = what the company pays him («المجاني» only lowers the cash he hands in,
 * never his money). His % can be set for the
 * week («كل واحد ليه اتفاق»); a day's figures are typed on the day itself. Closing
 * the week pays him and settles every order and bonus of it.
 */
import { useIsFetching, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  dayLabel,
  downloadCsv,
  errMsg,
  ExportButtons,
  money,
  shiftDay,
  signed,
} from '../components/accounting/kit.js';
import { Button } from '../components/ui/Button.js';
import { Dialog } from '../components/ui/Dialog.js';
import { api } from '../lib/api.js';
import { cn } from '../lib/utils.js';
import {
  ClosedBox,
  CloseForm,
  FIG_LABEL,
  FIG_TONE,
  figText,
  FigureTiles,
  ModeToggle,
  OrdersList,
  OrdersNotes,
  pctLabel,
  SplitBox,
  STATUS_AR,
  STATUS_TONE,
  type Calc,
  type Closing,
  type Figure,
  type WeekPct,
} from './accounting-drivers.js';

type Sums = Record<Figure | 'cash' | 'owed', number>;
interface WeekDayRow {
  day: string;
  orders: number;
  attendance: string | null;
  calc: Sums & { pct: number };
  edited: boolean;
  closed: boolean;
  /** the cash he handed in − what he should have (closed days) */
  diff: number;
  changed: boolean;
}
interface DriverWeek {
  driverId: string;
  name: string;
  phone: string | null;
  orders: number;
  free: number;
  freeCost: number;
  pharmacy: number;
  pharmacyFees: number;
  worth: number;
  cashFees: number;
  otherFees: number;
  /** on his orders (the week's % box) */
  share: number;
  pct: number | null;
  company: number;
  advances: number;
  unpaidOrders: number;
  days: WeekDayRow[];
  daysClosed: number;
  daysChanged: number;
  daysEdited: number;
  openDays: number;
  profilePct: number | null;
  weekPct: WeekPct | null;
  calc: Sums & { pct: number | null; received: number; diff: number };
  /** what the company pays him: every day's remaining, less what he handed in short */
  payable: number;
  closing: Closing | null;
}
interface WeekSheet {
  weekStart: string;
  weekEnd: string;
  today: string;
  thisWeek: string;
  isFuture: boolean;
  ended: boolean;
  lines: DriverWeek[];
  totals: {
    drivers: number;
    closed: number;
    orders: number;
    payable: number;
    paid: number;
    calc: Sums & { received: number; diff: number };
  };
}

const weekName = (s: WeekSheet) => `${dayLabel(s.weekStart)} ← ${dayLabel(s.weekEnd)}`;
const FIGS = ['total', 'company', 'share', 'free', 'bonus', 'deduction', 'remaining'] as const;
const asCalc = (c: DriverWeek['calc']) => ({ ...c, pct: c.pct ?? 0, edits: {} }) as unknown as Calc;

export function DriversWeekTab({
  week,
  onWeek,
  onMode,
  onOpenDay,
}: {
  week: string;
  onWeek: (v: string) => void;
  onMode: (m: 'day' | 'week') => void;
  onOpenDay: (day: string) => void;
}) {
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['acct', 'drivers-week', week],
    queryFn: () =>
      api.raw
        .get('/admin/accounting/drivers-week', { params: { week } })
        .then((r) => r.data.data as WeekSheet),
    placeholderData: (prev) => prev,
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const current = data?.lines.find((l) => l.driverId === openId) ?? null;

  const csv = () =>
    data &&
    downloadCsv(`تقفيل المناديب أسبوع ${data.weekStart}`, [
      ['تقفيل المناديب', `من ${data.weekStart} لحد ${data.weekEnd}`],
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
        'ناقص من الكاش',
        'يقبض',
        'اتدفعله',
        'الحالة',
      ],
      ...data.lines.map((l) => [
        l.name,
        l.orders,
        l.free,
        l.pharmacy,
        l.calc.total,
        l.calc.company,
        l.calc.pct ?? '',
        l.calc.share,
        l.calc.free,
        l.calc.bonus,
        l.calc.deduction,
        l.calc.remaining,
        l.calc.diff,
        l.payable,
        l.closing ? (l.closing.received ?? l.closing.expected) : '',
        l.closing ? 'اتقفل' : 'مفتوح',
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
        data.totals.calc.diff,
        data.totals.payable,
        data.totals.paid,
        `${data.totals.closed} من ${data.totals.drivers}`,
      ],
    ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <ModeToggle mode="week" onMode={onMode} />
          <div className="inline-flex items-center gap-1" data-print="hide">
            <button
              className="rounded-lg border border-border bg-card p-1.5 hover:bg-muted"
              title="الأسبوع اللي قبله"
              onClick={() => onWeek(shiftDay(data?.weekStart ?? week, -7))}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              className="rounded-lg border border-border bg-card p-1.5 hover:bg-muted disabled:opacity-30"
              title="الأسبوع اللي بعده"
              disabled={!data || data.weekStart >= data.thisWeek}
              onClick={() => data && onWeek(shiftDay(data.weekStart, 7))}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
          <span className="font-black">{data ? weekName(data) : '…'}</span>
          {isFetching && <Loader2 className="h-4 w-4 animate-spin text-brand-red" />}
        </div>
        <ExportButtons onCsv={csv} />
      </div>
      {isLoading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-brand-red" />
      ) : error || !data ? (
        <p className="text-sm text-destructive">{errMsg(error)}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {[
              ['المناديب', `${data.totals.closed} من ${data.totals.drivers} اتقفلوا`],
              ['الإجمالي', money(data.totals.calc.total)],
              ['نسبة الشركة', money(data.totals.calc.company)],
              ['المتبقي للمناديب', signed(data.totals.calc.remaining)],
              ['يقبضوا آخر الأسبوع', signed(data.totals.payable)],
              ['اتدفعلهم', money(data.totals.paid)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-xl border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">{l}</p>
                <p className="mt-1 text-lg font-black tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            الأسبوع من الثلاثاء للاتنين. المتبقي له = نسبته + البونص − الخصم من كل أيامه، ويقبض =
            المتبقي له − أي كاش سلّمه ناقص. المجاني بيقلّل الكاش اللي يسلّمه بس. الأرقام بتتعدل من
            اليوم نفسه، والنسبة بتتعدل للأسبوع كله من هنا. اضغط على أي مندوب عشان تقفّل أسبوعه
            وتديله فلوسه.
            {!data.ended && ' الأسبوع ده لسه ماخلصش.'}
          </p>
          {data.lines.length === 0 ? (
            <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              مفيش مناديب اشتغلوا في الأسبوع ده.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full min-w-[1100px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    {[
                      'المندوب',
                      'طلبات',
                      ...FIGS.map((f) => FIG_LABEL[f]),
                      'ناقص كاش',
                      'يقبض',
                      '',
                    ].map((h, i) => (
                      <th key={i} className="px-3 py-2 text-start font-bold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((l) => (
                    <tr
                      key={l.driverId}
                      onClick={() => setOpenId(l.driverId)}
                      className={cn(
                        'cursor-pointer border-t border-border/60 tabular-nums hover:bg-muted/30',
                        l.closing && 'bg-emerald-50/50',
                      )}
                    >
                      <td className="px-3 py-2">
                        <div className="font-bold">{l.name}</div>
                        <span className="text-[11px] text-muted-foreground">
                          {l.days.length} يوم
                          {l.daysClosed > 0 && ` · ${l.daysClosed} اتقفل`}
                          {l.daysEdited > 0 && ' · فيه تعديل'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {l.orders}
                        {(l.free > 0 || l.pharmacy > 0) && (
                          <span className="ms-1 text-xs text-muted-foreground">
                            (
                            {[l.free && `${l.free} مجاني`, l.pharmacy && `${l.pharmacy} صيدلية`]
                              .filter(Boolean)
                              .join('، ')}
                            )
                          </span>
                        )}
                      </td>
                      {FIGS.map((f) => (
                        <td key={f} className={cn('px-3 py-2', FIG_TONE[f])}>
                          {figText(f, l.calc[f])}
                          {f === 'share' && (
                            <span className="block text-[11px] font-normal text-muted-foreground">
                              {pctLabel(l.calc.pct)}
                              {l.weekPct && ' · للأسبوع'}
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-destructive">
                        {l.calc.diff < -0.005 ? `−${money(-l.calc.diff)}` : '—'}
                      </td>
                      <td className="px-3 py-2 font-black">{signed(l.payable)}</td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        {l.closing ? (
                          l.closing.changed ? (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                              <AlertTriangle className="h-3 w-3" /> اتغير بعد التقفيل
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                              <CheckCircle2 className="h-3 w-3" /> اتدفعله
                            </span>
                          )
                        ) : (
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
                  ))}
                  <tr className="border-t-2 border-border font-black tabular-nums">
                    <td className="px-3 py-2">الإجمالي</td>
                    <td className="px-3 py-2">{data.totals.orders}</td>
                    {FIGS.map((f) => (
                      <td key={f} className="px-3 py-2">
                        {figText(f, data.totals.calc[f])}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      {data.totals.calc.diff < -0.005 ? `−${money(-data.totals.calc.diff)}` : '—'}
                    </td>
                    <td className="px-3 py-2">{signed(data.totals.payable)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {current && (
            <DriverWeekDialog
              line={current}
              sheet={data}
              onClose={() => setOpenId(null)}
              onOpenDay={onOpenDay}
            />
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────── one driver's week ───────────────────────────
function DriverWeekDialog({
  line: l,
  sheet,
  onClose,
  onOpenDay,
}: {
  line: DriverWeek;
  sheet: WeekSheet;
  onClose: () => void;
  onOpenDay: (day: string) => void;
}) {
  const qc = useQueryClient();
  const ws = sheet.weekStart;
  const done = () => qc.invalidateQueries({ queryKey: ['acct'] });
  const refreshing = useIsFetching({ queryKey: ['acct', 'drivers-week', ws] });
  const editable = !l.closing && !sheet.isFuture;

  const close = useMutation({
    mutationFn: (v: { received: number | null; note: string }) =>
      api.raw.post('/admin/accounting/drivers-week/close', {
        driverId: l.driverId,
        week: ws,
        paid: v.received,
        note: v.note,
      }),
    onSuccess: () => {
      toast.success(`اتقفل أسبوع ${l.name}`);
      done();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const reopen = useMutation({
    mutationFn: () => api.raw.delete(`/admin/accounting/drivers-week/close/${l.driverId}/${ws}`),
    onSuccess: () => {
      toast.success('الأسبوع اتفتح للتعديل');
      done();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${l.name} · ${weekName(sheet)}`}
      size="xl"
    >
      <div className="space-y-4 text-sm">
        <p className="text-xs text-muted-foreground">
          {l.orders} أوردر في {l.days.length} يوم · الكاش اللي سلّمه أو هيسلّمه {money(l.calc.cash)}
        </p>
        <FigureTiles c={asCalc(l.calc)} freeCount={l.free + l.pharmacy} onEdit={null} />
        <OrdersNotes l={l} />

        <SplitBox
          key={`${l.weekPct?.pct}${l.pct}`}
          driverId={l.driverId}
          week={ws}
          pct={l.pct}
          profilePct={l.profilePct}
          weekPct={l.weekPct}
          editable={editable && l.daysClosed === 0}
          whyNot={
            l.closing
              ? 'أسبوعه متقفل، افتحه الأول عشان تعدّل.'
              : l.daysClosed > 0
                ? 'فيه يوم متقفل في الأسبوع ده، افتحه الأول عشان النسبة تتغير على الأسبوع كله.'
                : null
          }
        />

        <section className="space-y-2 rounded-xl border border-border p-3">
          <p className="font-black">أيامه</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-xs tabular-nums [&_td]:whitespace-nowrap">
              <thead className="text-muted-foreground">
                <tr>
                  {['اليوم', 'طلبات', ...FIGS.map((f) => FIG_LABEL[f]), 'الكاش', ''].map((h, i) => (
                    <th key={i} className="py-1.5 pe-2 text-start font-bold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {l.days.map((d) => (
                  <tr key={d.day} className="border-t border-border/50">
                    <td className="py-1.5 pe-2 font-bold">
                      {dayLabel(d.day)}
                      {d.attendance && d.attendance !== 'off' && (
                        <span
                          className={cn(
                            'ms-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                            STATUS_TONE[d.attendance],
                          )}
                        >
                          {STATUS_AR[d.attendance]}
                        </span>
                      )}
                      {d.edited && <Pencil className="ms-1 inline h-3 w-3 text-amber-600" />}
                    </td>
                    <td className="py-1.5 pe-2">{d.orders}</td>
                    {FIGS.map((f) => (
                      <td key={f} className={cn('py-1.5 pe-2', FIG_TONE[f])}>
                        {figText(f, d.calc[f])}
                      </td>
                    ))}
                    <td className="py-1.5 pe-2">
                      {money(d.calc.cash)}
                      {d.closed && d.diff < -0.005 && (
                        <span className="ms-1 text-destructive">ناقص {money(-d.diff)}</span>
                      )}
                    </td>
                    <td className="py-1.5">
                      {d.closed && (
                        <span
                          className={cn('me-2', d.changed ? 'text-amber-700' : 'text-emerald-700')}
                        >
                          {d.changed ? 'اتغير بعد التقفيل' : 'اتقفل'}
                        </span>
                      )}
                      <button
                        type="button"
                        className="text-brand-red underline-offset-2 hover:underline"
                        onClick={() => onOpenDay(d.day)}
                      >
                        {editable && !d.closed ? 'افتح اليوم وعدّل' : 'افتح اليوم'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            الإجمالي ونسبة الشركة ونسبته والمجاني والبونص والخصم والمتبقي له بيتعدلوا من اليوم نفسه:
            دوس «افتح اليوم» وبعدين على الرقم.
          </p>
        </section>
        {l.advances > 0 && (
          <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
            خد سلف {money(l.advances)} الأسبوع ده (من «الحركات اليومية»). مش متخصومة هنا، لو هتخصمها
            زوّدها على خصم يوم منهم.
          </p>
        )}

        <section className="rounded-xl border-2 border-brand-red/20 bg-brand-red/[0.03] p-3 tabular-nums">
          {[
            [`نسبته (${pctLabel(l.calc.pct)})`, money(l.calc.share)],
            ['البونص', l.calc.bonus ? `+ ${money(l.calc.bonus)}` : '0'],
            ['الخصم', l.calc.deduction ? `− ${money(l.calc.deduction)}` : '0'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between py-0.5">
              <span className="text-muted-foreground">{k}</span>
              <span>{v}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-border pt-1.5 font-black">
            <span>المتبقي له من أيامه</span>
            <span>{signed(l.calc.remaining)}</span>
          </div>
          {Math.abs(l.calc.diff) >= 0.005 && (
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">
                {l.calc.diff < 0 ? 'سلّم كاش ناقص' : 'سلّم كاش زيادة'}
              </span>
              <span>
                {l.calc.diff < 0 ? '− ' : '+ '}
                {money(Math.abs(l.calc.diff))}
              </span>
            </div>
          )}
          <div className="flex justify-between text-base font-black">
            <span>يقبض</span>
            <span>{signed(l.payable)}</span>
          </div>
          {l.openDays > 0 && !l.closing && (
            <p className="mt-1 text-xs text-muted-foreground">
              {l.openDays} يوم لسه مفتوح: بيتحسبوا إنه سلّم الكاش كله (
              {money(l.days.filter((d) => !d.closed).reduce((s, d) => s + d.calc.cash, 0))}).
            </p>
          )}
        </section>

        <OrdersList driverId={l.driverId} week={ws} count={l.orders} />

        {l.closing ? (
          <ClosedBox
            c={l.closing}
            canReopen
            busy={reopen.isPending}
            onReopen={() => reopen.mutate()}
            week
          />
        ) : sheet.isFuture ? null : (
          <>
            {!sheet.ended && (
              <p className="text-xs font-bold text-amber-700">
                الأسبوع لسه ماخلصش، وأي أوردر ييجي بعد التقفيل هيبان «اتغير بعد التقفيل».
              </p>
            )}
            <CloseForm
              expected={l.payable}
              busy={close.isPending}
              waiting={refreshing > 0}
              onClose={(v) => close.mutate(v)}
              week
            />
          </>
        )}
      </div>
    </Dialog>
  );
}
