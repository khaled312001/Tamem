/**
 * «تقفيل المناديب» — each driver's work day, the way the accountant closes it.
 *
 * Per driver: his share of the delivery fees, the bonus and the lateness /
 * absence deductions the rules worked out, and the accountant's own changes
 * (another amount for any of them, or a ± line with its reason). That gives
 * «صافي ليه»; what he collected in cash minus that is what he hands over.
 * Closing his day records what was actually received and settles the day
 * (orders and bonus marked paid), so the drivers report and «حسابي» agree.
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
  Plus,
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

type RuleKind = 'BONUS' | 'LATE' | 'ABSENCE';
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
export interface DriverDay {
  driverId: string;
  name: string;
  phone: string | null;
  orders: number;
  free: number;
  worth: number;
  cashFees: number;
  otherFees: number;
  share: number;
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
  net: number;
  handOver: number;
  unpaidOrders: number;
  closing: {
    expected: number;
    received: number | null;
    diff: number | null;
    note: string | null;
    closedByName: string | null;
    closedAt: string;
    settled: boolean;
    changed: boolean;
  } | null;
}
interface Sheet {
  day: string;
  today: string;
  isFuture: boolean;
  locked: 'DAY' | 'MONTH' | null;
  editableFrom: string;
  editsReady: boolean;
  lines: DriverDay[];
  totals: {
    drivers: number;
    closed: number;
    orders: number;
    share: number;
    bonus: number;
    deductions: number;
    extras: number;
    net: number;
    cashFees: number;
    handOver: number;
    received: number;
  };
}

const STATUS_AR: Record<string, string> = {
  ontime: 'في معاده',
  late: 'متأخر',
  absent: 'غياب',
  waiting: 'لسه ماوصلش',
  off: 'مش عليه وردية',
};
const STATUS_TONE: Record<string, string> = {
  ontime: 'bg-emerald-100 text-emerald-800',
  late: 'bg-amber-100 text-amber-800',
  absent: 'bg-red-100 text-red-800',
  waiting: 'bg-sky-100 text-sky-800',
  off: 'bg-muted text-muted-foreground',
};
const inputCls = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm';
const deductions = (l: DriverDay) => l.late.amount + l.absence.amount; // ≤ 0
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

function useSheet(day: string) {
  return useQuery({
    queryKey: ['acct', 'drivers-day', day],
    queryFn: () =>
      api.raw
        .get('/admin/accounting/drivers-day', { params: { date: day } })
        .then((r) => r.data.data as Sheet),
  });
}

/** Hand-over: positive = he gives the company, negative = the company owes him. */
function HandOver({ v }: { v: number }) {
  if (Math.abs(v) < 0.005) return <span className="text-muted-foreground">0</span>;
  return v > 0 ? (
    <span className="font-black">{money(v)}</span>
  ) : (
    <span className="font-bold text-amber-700">ليه {money(-v)}</span>
  );
}

export function DriversDayTab({
  meta,
  day,
  onDay,
}: {
  meta: Meta;
  day: string;
  onDay: (v: string) => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useSheet(day);
  const [openId, setOpenId] = useState<string | null>(null);
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

  const open = data?.lines.filter(
    (l) => !l.closing && (l.orders > 0 || Math.abs(l.net) >= 0.01 || Math.abs(l.handOver) >= 0.01),
  );
  const csv = () =>
    data &&
    downloadCsv(`تقفيل المناديب ${day}`, [
      ['تقفيل المناديب', day],
      [],
      [
        'المندوب',
        'طلبات',
        'قيمة التوصيل',
        'نصيبه',
        'بونص',
        'خصم تأخير وغياب',
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
        l.worth,
        l.share,
        l.bonus.amount,
        deductions(l),
        l.extrasTotal,
        l.net,
        l.cashFees,
        l.handOver,
        l.closing?.received ?? '',
        l.closing ? 'اتقفل' : 'مفتوح',
      ]),
      [
        'الإجمالي',
        data.totals.orders,
        '',
        data.totals.share,
        data.totals.bonus,
        -data.totals.deductions,
        data.totals.extras,
        data.totals.net,
        data.totals.cashFees,
        data.totals.handOver,
        data.totals.received,
        `${data.totals.closed} من ${data.totals.drivers}`,
      ],
    ]);

  const current = data?.lines.find((l) => l.driverId === openId) ?? null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <DayNav value={day} onChange={onDay} max={meta.today} />
          <span className="font-black">{dayLabel(day)}</span>
        </div>
        <ExportButtons onCsv={csv} />
      </div>
      {isLoading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-brand-red" />
      ) : error || !data ? (
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
              ['طلبات مسلّمة', String(data.totals.orders)],
              ['نصيب المناديب', money(data.totals.share)],
              [
                'بونص − خصومات',
                signed(data.totals.bonus - data.totals.deductions + data.totals.extras),
              ],
              ['المفروض يتسلّم', signed(data.totals.handOver)],
              ['اتسلّم فعلاً', money(data.totals.received)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-xl border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">{l}</p>
                <p className="mt-1 text-lg font-black tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            صافي ليه = نصيبه من التوصيل + البونص − خصم التأخير والغياب ± أي خصم أو إضافة. يسلّم
            للشركة = اللي حصّله كاش من التوصيل − صافي ليه. اضغط على أي مندوب عشان تعدّل أو تقفّل
            يومه.
          </p>
          {data.lines.length === 0 ? (
            <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              مفيش مناديب اشتغلوا أو عليهم حاجة في اليوم ده.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr className="text-start">
                    {[
                      'المندوب',
                      'طلبات',
                      'نصيبه',
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
                        {l.free > 0 && (
                          <span className="ms-1 text-xs text-muted-foreground">
                            ({l.free} مجاني)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-emerald-700">{money(l.share)}</td>
                      <td className="px-3 py-2">
                        {l.bonus.amount ? `+${money(l.bonus.amount)}` : '—'}
                        {(l.bonus.edited || l.bonus.waived) && (
                          <Pencil className="ms-1 inline h-3 w-3 text-amber-600" />
                        )}
                      </td>
                      <td className="px-3 py-2 text-destructive">
                        {deductions(l) ? `−${money(-deductions(l))}` : '—'}
                        {(l.late.edited ||
                          l.absence.edited ||
                          l.late.waived ||
                          l.absence.waived) && (
                          <Pencil className="ms-1 inline h-3 w-3 text-amber-600" />
                        )}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-2',
                          l.extrasTotal < 0 ? 'text-destructive' : 'text-emerald-700',
                        )}
                      >
                        {l.extrasTotal
                          ? (l.extrasTotal > 0 ? '+' : '') + signed(l.extrasTotal)
                          : '—'}
                      </td>
                      <td className="px-3 py-2 font-black">{signed(l.net)}</td>
                      <td className="px-3 py-2">{money(l.cashFees)}</td>
                      <td className="px-3 py-2">
                        <HandOver v={l.handOver} />
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
                  ))}
                  <tr className="border-t-2 border-border font-black tabular-nums">
                    <td className="px-3 py-2">الإجمالي</td>
                    <td className="px-3 py-2">{data.totals.orders}</td>
                    <td className="px-3 py-2">{money(data.totals.share)}</td>
                    <td className="px-3 py-2">{money(data.totals.bonus)}</td>
                    <td className="px-3 py-2">
                      {data.totals.deductions ? `−${money(data.totals.deductions)}` : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {data.totals.extras ? signed(data.totals.extras) : '—'}
                    </td>
                    <td className="px-3 py-2">{signed(data.totals.net)}</td>
                    <td className="px-3 py-2">{money(data.totals.cashFees)}</td>
                    <td className="px-3 py-2">{signed(data.totals.handOver)}</td>
                    <td className="px-3 py-2">{money(data.totals.received)}</td>
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
                فاضل {open.length} مندوب مفتوحين. «قفّل الكل» بيقفّلهم على إن كل واحد سلّم المطلوب
                منه بالظبط.
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
            message="كل مندوب هيتقفل على إنه سلّم المطلوب منه بالظبط، وطلباته وبونصه هيتعلّموا اتسوّوا. اللي سلّم مبلغ مختلف قفّله لوحده من الجدول."
            confirmLabel="قفّل الكل"
            tone="primary"
            loading={closeAll.isPending}
            onConfirm={() => closeAll.mutate()}
          />
          {current && (
            <DriverDayDialog line={current} sheet={data} onClose={() => setOpenId(null)} />
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────── one driver's day ───────────────────────────
function DriverDayDialog({
  line: l,
  sheet,
  onClose,
}: {
  line: DriverDay;
  sheet: Sheet;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const day = sheet.day;
  const done = () => qc.invalidateQueries({ queryKey: ['acct'] });
  const refreshing = useIsFetching({ queryKey: ['acct', 'drivers-day', day] });
  const editable =
    !sheet.locked && !sheet.isFuture && !l.closing && sheet.editsReady && day >= sheet.editableFrom;
  const whyNot = sheet.locked
    ? 'اليوم متقفل في الحسابات.'
    : l.closing
      ? 'يومه متقفل — افتحه الأول عشان تعدّل.'
      : day < sheet.editableFrom
        ? `التعديل بيبدأ من ${sheet.editableFrom}.`
        : !sheet.editsReady
          ? 'التعديلات مش جاهزة على السيرفر.'
          : null;

  const adjust = useMutation({
    mutationFn: (v: { kind: RuleKind; amount: number | null; note?: string }) =>
      api.raw.post('/admin/accounting/drivers-day/adjust', { driverId: l.driverId, day, ...v }),
    onSuccess: () => {
      toast.success('اتعدّل');
      done();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const addExtra = useMutation({
    mutationFn: (v: { type: 'DEDUCT' | 'ADD'; amount: number; note: string }) =>
      api.raw.post('/admin/accounting/drivers-day/extra', { driverId: l.driverId, day, ...v }),
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
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${l.name} · ${dayLabel(day)}`}
      size="lg"
    >
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['طلبات', `${l.orders}${l.free ? ` (${l.free} مجاني)` : ''}`],
            ['قيمة التوصيل', money(l.worth)],
            ['نصيبه', money(l.share)],
            ['حصّل كاش', money(l.cashFees)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-muted/40 p-2">
              <p className="text-[11px] text-muted-foreground">{k}</p>
              <p className="font-black tabular-nums">{v}</p>
            </div>
          ))}
        </div>
        {l.otherFees > 0 && (
          <p className="text-xs text-muted-foreground">
            و{money(l.otherFees)} توصيل اتدفعوا فودافون كاش أو إنستاباي للشركة على طول، مش معاه.
          </p>
        )}
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

        <section className="space-y-2 rounded-xl border border-border p-3">
          <p className="font-black">البونص والخصومات</p>
          <KindRow
            key={`B${l.bonus.amount}${l.bonus.note}`}
            label="البونص"
            k="BONUS"
            v={l.bonus}
            hint={
              l.bonus.tier
                ? `المحسوب ${money(l.bonus.auto)} (وصل ${l.bonus.tier} أوردر)`
                : l.bonus.next
                  ? `مفيش بونص محسوب (فاضله ${l.bonus.next.orders - l.orders} أوردر على ${money(l.bonus.next.amount)})`
                  : 'مفيش بونص محسوب'
            }
            editable={editable}
            busy={adjust.isPending}
            onSave={(amount, note) => adjust.mutateAsync({ kind: 'BONUS', amount, note })}
          />
          {(l.late.auto || l.late.edited || l.late.waived || a?.status === 'late') && (
            <KindRow
              key={`L${l.late.amount}${l.late.note}`}
              label="خصم التأخير"
              k="LATE"
              v={l.late}
              hint={l.late.auto ? `المحسوب ${money(-l.late.auto)}` : 'مفيش خصم تأخير محسوب'}
              editable={editable}
              busy={adjust.isPending}
              onSave={(amount, note) => adjust.mutateAsync({ kind: 'LATE', amount, note })}
            />
          )}
          {(l.absence.auto || l.absence.edited || l.absence.waived || a?.status === 'absent') && (
            <KindRow
              key={`A${l.absence.amount}${l.absence.note}`}
              label="خصم الغياب"
              k="ABSENCE"
              v={l.absence}
              hint={l.absence.auto ? `المحسوب ${money(-l.absence.auto)}` : 'مفيش خصم غياب محسوب'}
              editable={editable}
              busy={adjust.isPending}
              onSave={(amount, note) => adjust.mutateAsync({ kind: 'ABSENCE', amount, note })}
            />
          )}
        </section>

        <section className="space-y-2 rounded-xl border border-border p-3">
          <p className="font-black">خصم أو إضافة</p>
          {l.extras.length === 0 ? (
            <p className="text-xs text-muted-foreground">مفيش.</p>
          ) : (
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
          )}
          {editable && (
            <ExtraForm busy={addExtra.isPending} onAdd={(v) => addExtra.mutateAsync(v)} />
          )}
          {l.advances > 0 && (
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
              خد سلفة {money(l.advances)} اليوم ده (من «الحركات اليومية»). مش متخصومة هنا، لو
              هتخصمها من يومه ضيفها خصم.
            </p>
          )}
        </section>

        <section className="rounded-xl border-2 border-brand-red/20 bg-brand-red/[0.03] p-3 tabular-nums">
          {[
            ['نصيبه', money(l.share)],
            ['البونص', l.bonus.amount ? `+ ${money(l.bonus.amount)}` : '0'],
            ['خصم التأخير والغياب', deductions(l) ? `− ${money(-deductions(l))}` : '0'],
            [
              'خصم أو إضافة',
              l.extrasTotal ? (l.extrasTotal > 0 ? '+ ' : '') + signed(l.extrasTotal) : '0',
            ],
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
          <div className="flex justify-between text-base font-black">
            <span>{l.handOver >= 0 ? 'يسلّم للشركة' : 'ليه عند الشركة'}</span>
            <span className={l.handOver < 0 ? 'text-amber-700' : ''}>
              {money(Math.abs(l.handOver))}
            </span>
          </div>
        </section>

        <OrdersList driverId={l.driverId} day={day} count={l.orders} />

        {l.closing ? (
          <ClosedBox
            c={l.closing}
            canReopen={!sheet.locked}
            busy={reopen.isPending}
            onReopen={() => reopen.mutate()}
          />
        ) : sheet.locked || sheet.isFuture ? (
          whyNot && <p className="text-xs text-muted-foreground">{whyNot}</p>
        ) : (
          <CloseForm
            handOver={l.handOver}
            busy={close.isPending}
            // an edit still saving would close on yesterday's numbers
            waiting={adjust.isPending || addExtra.isPending || delExtra.isPending || refreshing > 0}
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

/** One computed kind: what the rules say, what counts now, and the accountant's amount. */
function KindRow({
  label,
  k,
  v,
  hint,
  editable,
  busy,
  onSave,
}: {
  label: string;
  k: RuleKind;
  v: KindLine;
  hint: string;
  editable: boolean;
  busy: boolean;
  onSave: (amount: number | null, note?: string) => Promise<unknown>;
}) {
  const shown = k === 'BONUS' ? v.amount : -v.amount; // deductions are typed and shown positive
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(shown));
  const [note, setNote] = useState(v.note ?? '');
  return (
    <div className="rounded-lg bg-muted/30 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-bold">{label}: </span>
          <span
            className={cn(
              'font-black tabular-nums',
              k === 'BONUS' ? 'text-emerald-700' : 'text-destructive',
            )}
          >
            {money(shown)}
          </span>
          {v.edited && (
            <span className="ms-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
              معدّل
            </span>
          )}
          {v.waived && (
            <span className="ms-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
              معفي
            </span>
          )}
          <p className="text-xs text-muted-foreground">
            {hint}
            {v.note ? ` · ${v.note}` : ''}
          </p>
        </div>
        {editable && !editing && (
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" /> عدّل
            </Button>
            {(v.edited || v.waived) && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onSave(null).catch(() => {})}
              >
                <RotateCcw className="h-3.5 w-3.5" /> رجّع المحسوب
              </Button>
            )}
          </div>
        )}
      </div>
      {editing && (
        <div className="mt-2 grid gap-2 sm:grid-cols-[120px_1fr_auto]">
          <input
            type="number"
            min={0}
            inputMode="decimal"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            className={inputCls}
            aria-label={`${label} الجديد`}
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="السبب (اختياري)"
            maxLength={255}
            className={inputCls}
          />
          <div className="flex gap-1">
            <Button
              size="sm"
              disabled={busy || val === '' || Number(val) < 0}
              onClick={() =>
                // stays open if refused, so the typed amount isn't lost
                onSave(Number(val), note).then(
                  () => setEditing(false),
                  () => {},
                )
              }
            >
              حفظ
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              إلغاء
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ExtraForm({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (v: { type: 'DEDUCT' | 'ADD'; amount: number; note: string }) => Promise<unknown>;
}) {
  const [type, setType] = useState<'DEDUCT' | 'ADD'>('DEDUCT');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const ok = Number(amount) > 0 && note.trim().length >= 2;
  return (
    <div className="grid gap-2 sm:grid-cols-[auto_110px_1fr_auto]">
      <div className="flex gap-1">
        {(
          [
            ['DEDUCT', 'خصم'],
            ['ADD', 'إضافة'],
          ] as const
        ).map(([k, t]) => (
          <button
            key={k}
            type="button"
            onClick={() => setType(k)}
            className={cn(
              'rounded-lg border px-3 py-2 text-xs font-bold',
              type === k
                ? k === 'DEDUCT'
                  ? 'border-destructive bg-red-50 text-destructive'
                  : 'border-emerald-600 bg-emerald-50 text-emerald-700'
                : 'border-border bg-card text-muted-foreground',
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <input
        type="number"
        min={0}
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="المبلغ"
        className={inputCls}
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="السبب (مثلاً: عهدة، مشوار زيادة)"
        maxLength={255}
        className={inputCls}
      />
      <Button
        size="sm"
        disabled={!ok || busy}
        onClick={() =>
          // cleared only once saved: a refused one keeps what was typed (the toast says why)
          onAdd({ type, amount: Number(amount), note: note.trim() }).then(
            () => {
              setAmount('');
              setNote('');
            },
            () => {},
          )
        }
      >
        <Plus className="h-4 w-4" /> ضيف
      </Button>
    </div>
  );
}

function OrdersList({ driverId, day, count }: { driverId: string; day: string; count: number }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['acct', 'drivers-day-orders', driverId, day],
    queryFn: () =>
      api.raw.get('/admin/accounting/drivers-day/orders', { params: { driverId, date: day } }).then(
        (r) =>
          r.data.data.orders as {
            id: string;
            orderNumber: string;
            createdAt: string;
            cash: boolean;
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
                    <td className="py-1">{clock(o.createdAt)}</td>
                    <td className="py-1">
                      {money(o.worth)}
                      {o.free && <span className="ms-1 text-emerald-700">مجاني</span>}
                    </td>
                    <td className="py-1">
                      {o.cash ? money(o.charged) : `${money(o.charged)} (محفظة)`}
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

function CloseForm({
  handOver,
  busy,
  waiting,
  onClose,
}: {
  handOver: number;
  busy: boolean;
  waiting: boolean;
  onClose: (v: { received: number | null; note: string }) => void;
}) {
  // null = not typed yet: follow what he owes (and let the server use its fresh number).
  // Once typed, a refresh never overwrites it; the عجز/زيادة line just follows the new number.
  const [typed, setTyped] = useState<string | null>(null);
  const received = typed ?? String(handOver);
  const [note, setNote] = useState('');
  const diff = received === '' ? 0 : Math.round((Number(received) - handOver) * 100) / 100;
  return (
    <section className="space-y-2 rounded-xl border border-emerald-300 bg-emerald-50/60 p-3">
      <p className="font-black">تقفيل يومه</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs font-bold">
          {handOver >= 0 ? 'استلمنا منه' : 'دفعنا له (اكتبه بالسالب)'}
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
          {diff < 0 ? `عجز ${money(-diff)}` : `زيادة ${money(diff)}`} عن المطلوب ({signed(handOver)}
          ). لو العجز هيتخصم منه، ضيفه خصم فوق قبل ما تقفّل.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        التقفيل بيعلّم طلبات اليوم والبونص والخصومات إنها اتسوّت، ومفيش تعديل بعده إلا لو فتحته
        تاني.
      </p>
      <Button
        disabled={busy || waiting || (received !== '' && Number.isNaN(Number(received)))}
        onClick={() =>
          onClose({ received: typed === null || received === '' ? null : Number(received), note })
        }
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{' '}
        قفّل يومه
      </Button>
    </section>
  );
}

function ClosedBox({
  c,
  canReopen,
  busy,
  onReopen,
}: {
  c: NonNullable<DriverDay['closing']>;
  canReopen: boolean;
  busy: boolean;
  onReopen: () => void;
}) {
  const [ask, setAsk] = useState(false);
  return (
    <section className="space-y-1 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-emerald-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-black">
          <Lock className="h-4 w-4" /> يومه متقفل
        </span>
        {canReopen && (
          <Button size="sm" variant="outline" onClick={() => setAsk(true)}>
            <LockOpen className="h-4 w-4" /> افتحه للتعديل
          </Button>
        )}
      </div>
      <p className="text-xs">
        المطلوب وقتها {signed(c.expected)} · اتسلّم {signed(c.received ?? c.expected)}
        {c.diff
          ? c.diff < 0
            ? ` · عجز ${money(-c.diff)}`
            : ` · زيادة ${money(c.diff)}`
          : ''} · {c.closedByName ?? 'مدير'} ·{' '}
        {new Date(c.closedAt).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}
      </p>
      {c.note && <p className="text-xs">ملاحظة: {c.note}</p>}
      {c.changed && (
        <p className="inline-flex items-center gap-1 text-xs font-bold text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5" /> فيه حاجة اتغيرت بعد التقفيل (طلب اتسلّم متأخر أو
          مبلغ اتعدّل). افتحه وقفّله تاني.
        </p>
      )}
      <ConfirmDialog
        open={ask}
        onOpenChange={setAsk}
        title="تفتح يوم المندوب؟"
        message="طلبات اليوم والبونص هيرجعوا «لسه ماتسوّوش» لحد ما تقفّله تاني."
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
