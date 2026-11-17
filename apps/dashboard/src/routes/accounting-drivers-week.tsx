/**
 * «تقفيل المناديب» by the week (Tue → Mon, like the shift schedule).
 *
 * Every driver's week added up from his days: fee value, his % and the company's,
 * bonus and deductions, what's left for him and what he hands over. His % can be
 * set for the week («كل واحد ليه اتفاق»), and the week closes in one go, settling
 * every order and bonus of it. Days closed alone stay as they were.
 */
import { useIsFetching, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Trash2,
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
  ExtraForm,
  HandOver,
  ModeToggle,
  OrdersList,
  OrdersNotes,
  pctLabel,
  SplitBox,
  STATUS_AR,
  STATUS_TONE,
  type DriverDay,
  type WeekPct,
} from './accounting-drivers.js';

interface WeekDayRow {
  day: string;
  orders: number;
  share: number;
  bonus: number;
  deductions: number;
  extras: number;
  net: number;
  cashFees: number;
  handOver: number;
  closed: boolean;
  attendance: string | null;
}
interface WeekExtra {
  id: string;
  amount: number;
  note: string;
  byName: string | null;
  createdAt: string;
  day: string;
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
  share: number;
  pct: number | null;
  company: number;
  bonus: number;
  /** positive: late + absence */
  deductions: number;
  extras: number;
  advances: number;
  net: number;
  handOver: number;
  unpaidOrders: number;
  daysClosed: number;
  closedExpected: number;
  closedReceived: number;
  /** what the week still expects from him (days closed alone already handed theirs over) */
  expected: number;
  profilePct: number | null;
  weekPct: WeekPct | null;
  extrasList: WeekExtra[];
  days: WeekDayRow[];
  closing: DriverDay['closing'];
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
    worth: number;
    share: number;
    company: number;
    bonus: number;
    deductions: number;
    extras: number;
    net: number;
    cashFees: number;
    pharmacyFees: number;
    freeCost: number;
    expected: number;
    received: number;
  };
}

const weekName = (s: WeekSheet) => `${dayLabel(s.weekStart)} ← ${dayLabel(s.weekEnd)}`;

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
        'قيمة التوصيل',
        'نسبته %',
        'نصيبه',
        'الشركة',
        'بونص',
        'خصومات',
        'خصم أو إضافة',
        'صافي ليه',
        'حصّل كاش',
        'يسلّم للشركة',
        'اتسلّم',
        'الحالة',
      ],
      ...data.lines.map((l) => [
        l.name,
        l.orders,
        l.free,
        l.pharmacy,
        l.worth,
        l.pct ?? '',
        l.share,
        l.company,
        l.bonus,
        -l.deductions,
        l.extras,
        l.net,
        l.cashFees,
        l.expected,
        l.closing?.received ?? '',
        l.closing ? 'اتقفل' : 'مفتوح',
      ]),
      [
        'الإجمالي',
        data.totals.orders,
        '',
        '',
        data.totals.worth,
        '',
        data.totals.share,
        data.totals.company,
        data.totals.bonus,
        -data.totals.deductions,
        data.totals.extras,
        data.totals.net,
        data.totals.cashFees,
        data.totals.expected,
        data.totals.received,
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
              ['طلبات مسلّمة', String(data.totals.orders)],
              ['قيمة التوصيل', money(data.totals.worth)],
              ['نصيب المناديب', money(data.totals.share)],
              ['نصيب الشركة', money(data.totals.company)],
              ['المفروض يتسلّم', signed(data.totals.expected)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-xl border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">{l}</p>
                <p className="mt-1 text-lg font-black tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            الأسبوع من الثلاثاء للاتنين. صافي ليه = نصيبه (نسبته من قيمة التوصيل) + البونص −
            الخصومات ± أي خصم أو إضافة. يسلّم للشركة = اللي حصّله كاش − صافي ليه (أوردرات صيدلية
            الطاهر والمحافظ مش معاه). اضغط على أي مندوب عشان تعدّل نسبته أو تقفّل أسبوعه.
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
                      'قيمة التوصيل',
                      'نسبته',
                      'نصيبه',
                      'الشركة',
                      'بونص',
                      'خصومات',
                      'خصم / إضافة',
                      'صافي ليه',
                      'حصّل كاش',
                      'يسلّم للشركة',
                      'اتسلّم',
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
                      <td className="px-3 py-2 font-bold">{l.name}</td>
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
                      <td className="px-3 py-2">{money(l.worth)}</td>
                      <td className="px-3 py-2">
                        {pctLabel(l.pct)}
                        {l.weekPct && (
                          <span className="ms-1 rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800">
                            معدّلة
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-emerald-700">{money(l.share)}</td>
                      <td className="px-3 py-2">{money(l.company)}</td>
                      <td className="px-3 py-2">{l.bonus ? `+${money(l.bonus)}` : '—'}</td>
                      <td className="px-3 py-2 text-destructive">
                        {l.deductions ? `−${money(l.deductions)}` : '—'}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-2',
                          l.extras < 0 ? 'text-destructive' : 'text-emerald-700',
                        )}
                      >
                        {l.extras ? (l.extras > 0 ? '+' : '') + signed(l.extras) : '—'}
                      </td>
                      <td className="px-3 py-2 font-black">{signed(l.net)}</td>
                      <td className="px-3 py-2">{money(l.cashFees)}</td>
                      <td className="px-3 py-2">
                        <HandOver v={l.expected} />
                      </td>
                      <td className="px-3 py-2">
                        {l.closing ? (
                          <span
                            className={cn(
                              l.closing.diff && l.closing.diff < 0 && 'text-destructive',
                            )}
                          >
                            {signed(l.closing.received ?? l.closing.expected)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        {l.closing ? (
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
                    <td className="px-3 py-2">{money(data.totals.worth)}</td>
                    <td />
                    <td className="px-3 py-2">{money(data.totals.share)}</td>
                    <td className="px-3 py-2">{money(data.totals.company)}</td>
                    <td className="px-3 py-2">{money(data.totals.bonus)}</td>
                    <td className="px-3 py-2">
                      {data.totals.deductions ? `−${money(data.totals.deductions)}` : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {data.totals.extras ? signed(data.totals.extras) : '—'}
                    </td>
                    <td className="px-3 py-2">{signed(data.totals.net)}</td>
                    <td className="px-3 py-2">{money(data.totals.cashFees)}</td>
                    <td className="px-3 py-2">{signed(data.totals.expected)}</td>
                    <td className="px-3 py-2">{money(data.totals.received)}</td>
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
  // A deduction/addition for the week sits on his last day of it that isn't closed alone.
  const lastDay = sheet.weekEnd < sheet.today ? sheet.weekEnd : sheet.today;
  const closedDays = new Set(l.days.filter((d) => d.closed).map((d) => d.day));
  let extraDay: string | null = lastDay;
  while (extraDay && closedDays.has(extraDay))
    extraDay = extraDay > ws ? shiftDay(extraDay, -1) : null;

  const addExtra = useMutation({
    mutationFn: (v: { type: 'DEDUCT' | 'ADD'; amount: number; note: string }) =>
      api.raw.post('/admin/accounting/drivers-day/extra', {
        driverId: l.driverId,
        day: extraDay,
        ...v,
      }),
    onSuccess: () => {
      toast.success('اتضاف');
      done();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const delExtra = useMutation({
    mutationFn: (id: string) => api.raw.delete(`/admin/accounting/drivers-day/extra/${id}`),
    onSuccess: () => done(),
    onError: (e) => toast.error(errMsg(e)),
  });
  const close = useMutation({
    mutationFn: (v: { received: number | null; note: string }) =>
      api.raw.post('/admin/accounting/drivers-week/close', {
        driverId: l.driverId,
        week: ws,
        ...v,
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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['طلبات', String(l.orders)],
            ['قيمة التوصيل', money(l.worth)],
            ['صافي ليه', signed(l.net)],
            ['حصّل كاش', money(l.cashFees)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-muted/40 p-2">
              <p className="text-[11px] text-muted-foreground">{k}</p>
              <p className="font-black tabular-nums">{v}</p>
            </div>
          ))}
        </div>
        <OrdersNotes l={l} />

        <SplitBox
          key={`${l.weekPct?.pct}${l.pct}`}
          driverId={l.driverId}
          week={ws}
          worth={l.worth}
          share={l.share}
          pct={l.pct}
          profilePct={l.profilePct}
          weekPct={l.weekPct}
          editable={editable}
          whyNot={l.closing ? 'أسبوعه متقفل، افتحه الأول عشان تعدّل.' : null}
        />

        <section className="space-y-2 rounded-xl border border-border p-3">
          <p className="font-black">أيامه</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs tabular-nums">
              <thead className="text-muted-foreground">
                <tr>
                  {['اليوم', 'طلبات', 'نصيبه', 'بونص', 'خصومات', '±', 'صافي', ''].map((h, i) => (
                    <th key={i} className="py-1.5 text-start font-bold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {l.days.map((d) => (
                  <tr key={d.day} className="border-t border-border/50">
                    <td className="py-1.5 font-bold">
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
                    </td>
                    <td className="py-1.5">{d.orders}</td>
                    <td className="py-1.5">{money(d.share)}</td>
                    <td className="py-1.5">{d.bonus ? `+${money(d.bonus)}` : '—'}</td>
                    <td className="py-1.5 text-destructive">
                      {d.deductions ? `−${money(d.deductions)}` : '—'}
                    </td>
                    <td className="py-1.5">{d.extras ? signed(d.extras) : '—'}</td>
                    <td className="py-1.5 font-black">{signed(d.net)}</td>
                    <td className="py-1.5">
                      {d.closed ? (
                        <span className="text-emerald-700">اتقفل لوحده</span>
                      ) : (
                        <button
                          type="button"
                          className="text-brand-red underline-offset-2 hover:underline"
                          onClick={() => onOpenDay(d.day)}
                        >
                          افتح اليوم
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            البونص وخصم التأخير والغياب بيتحسبوا كل يوم لوحده، ولو عايز تعدّل واحد منهم افتح اليوم
            بتاعه.
          </p>
        </section>

        <section className="space-y-2 rounded-xl border border-border p-3">
          <p className="font-black">خصم أو إضافة</p>
          {l.extrasList.length === 0 ? (
            <p className="text-xs text-muted-foreground">مفيش.</p>
          ) : (
            <ul className="divide-y divide-border">
              {l.extrasList.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span>
                    <b className={x.amount < 0 ? 'text-destructive' : 'text-emerald-700'}>
                      {x.amount < 0 ? `خصم ${money(-x.amount)}` : `إضافة ${money(x.amount)}`}
                    </b>{' '}
                    · {x.note}
                    <span className="text-xs text-muted-foreground">
                      {' '}
                      · {dayLabel(x.day)}
                      {x.byName && ` · ${x.byName}`}
                    </span>
                  </span>
                  {editable && !closedDays.has(x.day) && (
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
          )}
          {editable && extraDay && (
            <ExtraForm busy={addExtra.isPending} onAdd={(v) => addExtra.mutateAsync(v)} />
          )}
          {l.advances > 0 && (
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
              خد سلف {money(l.advances)} الأسبوع ده (من «الحركات اليومية»). مش متخصومة هنا، لو
              هتخصمها ضيفها خصم.
            </p>
          )}
        </section>

        <section className="rounded-xl border-2 border-brand-red/20 bg-brand-red/[0.03] p-3 tabular-nums">
          {[
            [`نصيبه (${pctLabel(l.pct)})`, money(l.share)],
            ['البونص', l.bonus ? `+ ${money(l.bonus)}` : '0'],
            ['خصم التأخير والغياب', l.deductions ? `− ${money(l.deductions)}` : '0'],
            ['خصم أو إضافة', l.extras ? (l.extras > 0 ? '+ ' : '') + signed(l.extras) : '0'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between py-0.5">
              <span className="text-muted-foreground">{k}</span>
              <span>{v}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-border pt-1.5 text-base font-black">
            <span>صافي ليه</span>
            <span>{signed(l.net)}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-muted-foreground">حصّل كاش من التوصيل</span>
            <span>{money(l.cashFees)}</span>
          </div>
          {l.daysClosed > 0 && (
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">
                اتقفل منه {l.daysClosed} يوم لوحده (المطلوب فيهم {signed(l.closedExpected)})
              </span>
              <span>− {signed(l.closedExpected)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-black">
            <span>{l.expected >= 0 ? 'يسلّم للشركة' : 'ليه عند الشركة'}</span>
            <span className={l.expected < 0 ? 'text-amber-700' : ''}>
              {money(Math.abs(l.expected))}
            </span>
          </div>
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
              handOver={l.expected}
              busy={close.isPending}
              waiting={addExtra.isPending || delExtra.isPending || refreshing > 0}
              onClose={(v) => close.mutate(v)}
              week
            />
          </>
        )}
      </div>
    </Dialog>
  );
}
