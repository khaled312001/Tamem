/** «التقفيل اليومي», «التقفيل الشهري» and «الموظفين والشركاء» tabs of the accounting page. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  UserX,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  dayLabel,
  DayNav,
  downloadCsv,
  errMsg,
  ExportButtons,
  KIND_LABEL,
  money,
  MonthNav,
  monthLabel,
  Panel,
  PARTY_LABEL,
  signed,
  type Closed,
  type DriverLine,
  type Entry,
  type Meta,
  type Party,
  type PartyType,
  type Pnl,
} from '../components/accounting/kit.js';
import { Button } from '../components/ui/Button.js';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js';
import { Dialog } from '../components/ui/Dialog.js';
import { api } from '../lib/api.js';
import { cn } from '../lib/utils.js';
import { CashTable, PnlStatement } from './accounting.js';

const inputCls = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm';
const Th = ({ children }: { children?: React.ReactNode }) => (
  <th className="py-2 text-start font-bold">{children}</th>
);
const Td = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <td className={cn('py-2 tabular-nums', className)}>{children}</td>
);

/** Closed / open banner with the close and reopen actions. */
function CloseBar({
  closed,
  label,
  canReopen,
  onClose,
  onReopen,
  busy,
  warn,
}: {
  closed: Closed | null;
  label: string;
  canReopen: boolean;
  onClose: (note: string) => void;
  onReopen: () => void;
  busy: boolean;
  warn?: string | null;
}) {
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [reopening, setReopening] = useState(false);
  if (closed)
    return (
      <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 font-bold">
            <Lock className="h-4 w-4" /> {label} متقفل
            <span className="font-normal">
              · {closed.closedByName ?? 'مدير'} ·{' '}
              {new Date(closed.closedAt).toLocaleString('ar-EG', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
              {closed.netProfit !== null && ` · صافي وقت التقفيل ${signed(closed.netProfit)}`}
            </span>
          </span>
          {canReopen && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setReopening(true)}
              data-print="hide"
            >
              <LockOpen className="h-4 w-4" /> افتحه للتعديل
            </Button>
          )}
        </div>
        {closed.note && <p className="mt-1 text-xs">ملاحظة: {closed.note}</p>}
        {closed.changed && (
          <p className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" /> فيه طلبات اتغيرت بعد التقفيل، والأرقام الحالية
            تحت مختلفة عن أرقام التقفيل.
          </p>
        )}
        <ConfirmDialog
          open={reopening}
          onOpenChange={setReopening}
          title={`تفتح ${label}؟`}
          message="الحركات هتتفتح للتعديل تاني، ولازم تقفله من جديد بعد ما تخلص."
          confirmLabel="افتحه"
          tone="primary"
          loading={busy}
          onConfirm={() => {
            onReopen();
            setReopening(false);
          }}
        />
      </div>
    );
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 text-sm"
      data-print="hide"
    >
      <span className="text-muted-foreground">
        {label} لسه مفتوح. التقفيل بيحفظ الأرقام دي ويقفل الحركات بتاعته.
        {warn && <span className="ms-1 font-bold text-amber-700">{warn}</span>}
      </span>
      <Button onClick={() => setAsking(true)} disabled={busy}>
        <CheckCircle2 className="h-4 w-4" /> قفّل {label}
      </Button>
      {asking && (
        <Dialog open onOpenChange={setAsking} title={`تقفيل ${label}`} size="sm">
          <div className="space-y-3 text-sm">
            {warn && <p className="rounded-lg bg-amber-50 p-2 text-amber-800">{warn}</p>}
            <label className="block font-bold">
              ملاحظة (اختياري)
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className={cn(inputCls, 'mt-1')}
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAsking(false)}>
                إلغاء
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  onClose(note);
                  setAsking(false);
                }}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} قفّل
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function useClosing(type: 'DAY' | 'MONTH', period: string) {
  const qc = useQueryClient();
  const close = useMutation({
    mutationFn: (note: string) => api.raw.post('/admin/accounting/close', { type, period, note }),
    onSuccess: () => {
      toast.success('اتقفل');
      qc.invalidateQueries({ queryKey: ['acct'] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const reopen = useMutation({
    mutationFn: () => api.raw.delete(`/admin/accounting/close/${type}/${period}`),
    onSuccess: () => {
      toast.success('اتفتح للتعديل');
      qc.invalidateQueries({ queryKey: ['acct'] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return { close, reopen, busy: close.isPending || reopen.isPending };
}

function DriversTable({ rows, period }: { rows: DriverLine[]; period: string }) {
  if (!rows.length)
    return <p className="text-sm text-muted-foreground">مفيش طلبات مسلّمة لمناديب في الفترة دي.</p>;
  const sum = (k: keyof DriverLine) => rows.reduce((a, r) => a + (r[k] as number), 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <Th>المندوب</Th>
            <Th>طلبات</Th>
            <Th>حصّل كاش</Th>
            <Th>رسوم التوصيل</Th>
            <Th>نصيبه</Th>
            <Th>للشركة</Th>
            <Th>سلف {period}</Th>
            <Th>اتسوّى له {period}</Th>
            <Th>باقي له (كل اللي فات)</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.driverId} className="border-b border-border/60">
              <Td className="font-bold">{r.name}</Td>
              <Td>{r.orders}</Td>
              <Td>{money(r.cashSales)}</Td>
              <Td>{money(r.fees)}</Td>
              <Td className="text-emerald-700">{money(r.share)}</Td>
              <Td>{signed(r.company)}</Td>
              <Td className={r.advances ? 'text-amber-700' : ''}>{money(r.advances)}</Td>
              <Td>{money(r.settled)}</Td>
              <Td className="font-black">{money(r.unsettled)}</Td>
            </tr>
          ))}
          <tr className="font-black">
            <Td>الإجمالي</Td>
            <Td>{sum('orders')}</Td>
            <Td>{money(sum('cashSales'))}</Td>
            <Td>{money(sum('fees'))}</Td>
            <Td>{money(sum('share'))}</Td>
            <Td>{signed(sum('company'))}</Td>
            <Td>{money(sum('advances'))}</Td>
            <Td>{money(sum('settled'))}</Td>
            <Td>{money(sum('unsettled'))}</Td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">
        «باقي له» = نصيبه من كل الطلبات اللي لسه ماتسوّتش (من صفحة السائقين). السلف مش متخصومة منه،
        اخصمها وانت بتسوّي.
      </p>
    </div>
  );
}

// ───────────────────────── Day ─────────────────────────
interface DaySheet extends Pnl {
  day: string;
  drivers: DriverLine[];
  entries: Entry[];
  closed: Closed | null;
  monthClosed: boolean;
  isFuture: boolean;
}

export function DayClosing({
  meta,
  day,
  onDay,
}: {
  meta: Meta;
  day: string;
  onDay: (v: string) => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['acct', 'day', day],
    queryFn: () =>
      api.raw
        .get('/admin/accounting/day', { params: { date: day } })
        .then((r) => r.data.data as DaySheet),
  });
  const c = useClosing('DAY', day);
  const csv = () =>
    data &&
    downloadCsv(`تقفيل ${day}`, [
      ['تقفيل يوم', day],
      ['طلبات', data.orders.orders],
      ['صافي الشركة من الطلبات', data.orders.companyNet],
      ['مصروفات', data.expenses],
      ['إيرادات أخرى', data.otherIncome],
      ['صافي اليوم', data.netProfit],
      [],
      [
        'المندوب',
        'طلبات',
        'حصّل كاش',
        'رسوم التوصيل',
        'نصيبه',
        'للشركة',
        'سلف',
        'اتسوّى له',
        'باقي له',
      ],
      ...data.drivers.map((r) => [
        r.name,
        r.orders,
        r.cashSales,
        r.fees,
        r.share,
        r.company,
        r.advances,
        r.settled,
        r.unsettled,
      ]),
      [],
      ['الحركات'],
      ...data.entries.map((e) => [
        KIND_LABEL[e.kind],
        e.category,
        e.amount,
        e.partyName ?? '',
        e.note ?? '',
      ]),
    ]);
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
          {data.monthClosed ? (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">
              <Lock className="me-1 inline h-4 w-4" /> الشهر كله متقفل.
            </div>
          ) : (
            !data.isFuture && (
              <CloseBar
                closed={data.closed}
                label="اليوم"
                canReopen={meta.canReopen}
                busy={c.busy}
                onClose={(n) => c.close.mutate(n)}
                onReopen={() => c.reopen.mutate()}
              />
            )
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              ['طلبات مسلّمة', String(data.orders.orders)],
              ['اتحصّل كاش', money(data.orders.cashSales)],
              ['صافي الشركة من الطلبات', signed(data.orders.companyNet)],
              ['مصروفات اليوم', money(data.expenses)],
              ['صافي اليوم', signed(data.netProfit)],
            ].map(([l, v], i) => (
              <div
                key={l}
                className={cn(
                  'rounded-xl border border-border bg-card p-3',
                  i === 4 &&
                    (data.netProfit >= 0
                      ? 'border-emerald-300 bg-emerald-50'
                      : 'border-red-300 bg-red-50'),
                )}
              >
                <p className="text-xs text-muted-foreground">{l}</p>
                <p className="mt-1 text-lg font-black tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          <Panel title="المناديب">
            <DriversTable rows={data.drivers} period="اليوم" />
          </Panel>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={`حركات اليوم (${data.entries.length})`}>
              {data.entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">مفيش حركات متسجلة اليوم ده.</p>
              ) : (
                <div className="divide-y divide-border text-sm">
                  {data.entries.map((e) => (
                    <div key={e.id} className="flex justify-between gap-2 py-1.5">
                      <span>
                        <b>{KIND_LABEL[e.kind]}</b> · {e.category}
                        {e.partyName ? ` · ${e.partyName}` : ''}
                        {e.note ? <span className="text-muted-foreground"> · {e.note}</span> : null}
                      </span>
                      <span className="font-bold tabular-nums">{money(e.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
            <Panel title="الفلوس حسب طريقة الدفع (من الحركات)">
              <CashTable cash={data.cashByMethod} />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

// ───────────────────────── Month ─────────────────────────
interface MonthSheet extends Pnl {
  month: string;
  distributable: number;
  partners: {
    id: string;
    type: PartyType;
    name: string;
    sharePct: number;
    share: number;
    withdrawals: number;
    capital: number;
    due: number;
  }[];
  undistributed: number;
  payroll: {
    id: string;
    name: string;
    salary: number;
    advances: number;
    paid: number;
    remaining: number;
    isActive: boolean;
  }[];
  drivers: DriverLine[];
  recurringDue: { count: number; amount: number };
  closed: Closed | null;
  ended: boolean;
}

export function MonthClosing({
  meta,
  month,
  onMonth,
}: {
  meta: Meta;
  month: string;
  onMonth: (v: string) => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['acct', 'month', month],
    queryFn: () =>
      api.raw
        .get('/admin/accounting/month', { params: { month } })
        .then((r) => r.data.data as MonthSheet),
  });
  const c = useClosing('MONTH', month);
  const warn = data
    ? [
        !data.ended ? 'الشهر لسه ماخلصش.' : null,
        data.recurringDue.count
          ? `فيه ${data.recurringDue.count} مصروف ثابت مستحق لسه ماتسجلش (${money(data.recurringDue.amount)}).`
          : null,
      ]
        .filter(Boolean)
        .join(' ') || null
    : null;
  const csv = () =>
    data &&
    downloadCsv(`تقفيل ${month}`, [
      ['تقفيل شهر', monthLabel(month)],
      ['صافي الشركة من الطلبات', data.orders.companyNet],
      ['بونص المناديب المدفوع', data.driverIncentives],
      ['إيرادات أخرى', data.otherIncome],
      ['المصروفات', data.expenses],
      ['صافي الربح', data.netProfit],
      [],
      ['المصروفات حسب البند'],
      ...data.expensesByCategory.map((x) => [x.category, x.amount]),
      [],
      ['الشريك', 'النسبة', 'نصيبه', 'مسحوبات', 'باقي له'],
      ...data.partners.map((p) => [p.name, p.sharePct, p.share, p.withdrawals, p.due]),
      ['غير موزّع', '', data.undistributed],
      [],
      ['الموظف', 'المرتب', 'سلف', 'اتصرف', 'باقي له'],
      ...data.payroll.map((p) => [p.name, p.salary, p.advances, p.paid, p.remaining]),
      [],
      ['المندوب', 'طلبات', 'رسوم التوصيل', 'نصيبه', 'للشركة', 'سلف', 'اتسوّى له', 'باقي له'],
      ...data.drivers.map((r) => [
        r.name,
        r.orders,
        r.fees,
        r.share,
        r.company,
        r.advances,
        r.settled,
        r.unsettled,
      ]),
    ]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <MonthNav value={month} onChange={onMonth} max={meta.thisMonth} />
          <span className="font-black">{monthLabel(month)}</span>
        </div>
        <ExportButtons onCsv={csv} />
      </div>
      {isLoading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-brand-red" />
      ) : error || !data ? (
        <p className="text-sm text-destructive">{errMsg(error)}</p>
      ) : (
        <>
          <CloseBar
            closed={data.closed}
            label="الشهر"
            canReopen={meta.canReopen}
            busy={c.busy}
            warn={warn}
            onClose={(n) => c.close.mutate(n)}
            onReopen={() => c.reopen.mutate()}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="قائمة الدخل">
              <PnlStatement p={data} />
            </Panel>
            <div className="space-y-4">
              <Panel title="توزيع الربح على الشركاء">
                {data.partners.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    ضيف الشركاء والمستثمرين ونسبهم من تاب «الموظفين والشركاء».
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr className="border-b border-border">
                        <Th>الشريك</Th>
                        <Th>النسبة</Th>
                        <Th>نصيبه</Th>
                        <Th>سحب</Th>
                        <Th>باقي له</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.partners.map((p) => (
                        <tr key={p.id} className="border-b border-border/60">
                          <Td className="font-bold">
                            {p.name}{' '}
                            <span className="text-xs font-normal text-muted-foreground">
                              ({PARTY_LABEL[p.type]})
                            </span>
                          </Td>
                          <Td>{p.sharePct}%</Td>
                          <Td className="text-emerald-700">{money(p.share)}</Td>
                          <Td>{money(p.withdrawals)}</Td>
                          <Td className="font-black">{signed(p.due)}</Td>
                        </tr>
                      ))}
                      <tr>
                        <Td className="text-muted-foreground">غير موزّع (يفضل في الشركة)</Td>
                        <Td />
                        <Td>{money(data.undistributed)}</Td>
                        <Td />
                        <Td />
                      </tr>
                    </tbody>
                  </table>
                )}
                {data.netProfit < 0 && (
                  <p className="mt-2 text-xs text-red-600">الشهر ده خسران، فمفيش أرباح تتوزع.</p>
                )}
              </Panel>
              <Panel title="مرتبات الموظفين">
                {data.payroll.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    ضيف الموظفين ومرتباتهم من تاب «الموظفين والشركاء».
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr className="border-b border-border">
                        <Th>الموظف</Th>
                        <Th>المرتب</Th>
                        <Th>سلف</Th>
                        <Th>اتصرف</Th>
                        <Th>باقي له</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.payroll.map((p) => (
                        <tr key={p.id} className="border-b border-border/60">
                          <Td className="font-bold">{p.name}</Td>
                          <Td>{money(p.salary)}</Td>
                          <Td className={p.advances ? 'text-amber-700' : ''}>
                            {money(p.advances)}
                          </Td>
                          <Td>{money(p.paid)}</Td>
                          <Td className={cn('font-black', p.remaining < 0 && 'text-red-600')}>
                            {signed(p.remaining)}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  «اتصرف» = أي مصروف متسجل على الموظف في الشهر (زي المرتب). السلفة بتتخصم من الباقي.
                </p>
              </Panel>
            </div>
          </div>
          <Panel title="المناديب في الشهر">
            <DriversTable rows={data.drivers} period="الشهر" />
          </Panel>
        </>
      )}
    </div>
  );
}

// ───────────────────────── People ─────────────────────────
export function PeopleTab({ meta }: { meta: Meta }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Party | PartyType | null>(null);
  const [statement, setStatement] = useState<Party | null>(null);
  const [removing, setRemoving] = useState<Party | null>(null);
  const del = useMutation({
    mutationFn: (id: string) => api.raw.delete(`/admin/accounting/parties/${id}`),
    onSuccess: (r) => {
      toast.success(r.data.data.deactivated ? 'اتوقّف (حركاته القديمة فاضلة)' : 'اتمسح');
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ['acct'] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const shares = meta.parties
    .filter((p) => p.isActive && p.type !== 'EMPLOYEE')
    .reduce((a, p) => a + (p.sharePct ?? 0), 0);
  const group = (types: PartyType[]) => meta.parties.filter((p) => types.includes(p.type));
  const Card = ({ p }: { p: Party }) => (
    <div className={cn('flex flex-wrap items-center gap-3 py-2.5', !p.isActive && 'opacity-50')}>
      <div className="min-w-[10rem] flex-1">
        <p className="font-black">
          {p.name}
          {!p.isActive && (
            <span className="ms-2 text-xs font-bold text-muted-foreground">(متوقف)</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {PARTY_LABEL[p.type]}
          {p.phone ? ` · ${p.phone}` : ''}
          {p.type === 'EMPLOYEE' && p.monthlySalary !== null
            ? ` · مرتب ${money(p.monthlySalary)}`
            : ''}
          {p.type !== 'EMPLOYEE' && p.sharePct !== null ? ` · ${p.sharePct}% من الربح` : ''}
          {p.capital ? ` · رأس مال ${money(p.capital)}` : ''}
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={() => setStatement(p)}>
        <FileText className="h-4 w-4" /> كشف حساب
      </Button>
      <button
        title="تعديل"
        onClick={() => setEditing(p)}
        className="text-muted-foreground hover:text-foreground"
      >
        <Pencil className="h-4 w-4" />
      </button>
      {p.isActive && (
        <button title="وقّفه" onClick={() => setRemoving(p)} className="text-red-500">
          <UserX className="h-4 w-4" />
        </button>
      )}
    </div>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel
        title="الشركاء والمستثمرين"
        action={
          <span className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing('OWNER')}>
              <Plus className="h-4 w-4" /> شريك
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing('INVESTOR')}>
              <Plus className="h-4 w-4" /> مستثمر
            </Button>
          </span>
        }
      >
        <p
          className={cn(
            'mb-2 text-xs font-bold',
            shares > 100 ? 'text-red-600' : 'text-muted-foreground',
          )}
        >
          مجموع النسب: {shares}% من 100%
          {shares < 100 ? ` · الباقي ${100 - shares}% يفضل في الشركة` : ''}
        </p>
        <div className="divide-y divide-border">
          {group(['OWNER', 'INVESTOR']).map((p) => (
            <Card key={p.id} p={p} />
          ))}
          {group(['OWNER', 'INVESTOR']).length === 0 && (
            <p className="py-3 text-sm text-muted-foreground">لسه مفيش.</p>
          )}
        </div>
      </Panel>
      <Panel
        title="الموظفين"
        action={
          <Button size="sm" variant="outline" onClick={() => setEditing('EMPLOYEE')}>
            <Plus className="h-4 w-4" /> موظف
          </Button>
        }
      >
        <div className="divide-y divide-border">
          {group(['EMPLOYEE']).map((p) => (
            <Card key={p.id} p={p} />
          ))}
          {group(['EMPLOYEE']).length === 0 && (
            <p className="py-3 text-sm text-muted-foreground">لسه مفيش.</p>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          المناديب مش هنا: حساباتهم من الطلبات نفسها، وسلفهم بتتسجل من «الحركات».
        </p>
      </Panel>
      {editing && (
        <PartyDialog
          party={typeof editing === 'string' ? null : editing}
          type={typeof editing === 'string' ? editing : editing.type}
          onClose={() => setEditing(null)}
        />
      )}
      {statement && <StatementDialog party={statement} onClose={() => setStatement(null)} />}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`توقّف ${removing?.name ?? ''}؟`}
        message="لو ليه حركات، بيتوقف بس وحركاته بتفضل. لو مالوش، بيتمسح."
        confirmLabel="وقّفه"
        loading={del.isPending}
        onConfirm={() => removing && del.mutate(removing.id)}
      />
    </div>
  );
}

function PartyDialog({
  party,
  type,
  onClose,
}: {
  party: Party | null;
  type: PartyType;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(party?.name ?? '');
  const [phone, setPhone] = useState(party?.phone ?? '');
  const [salary, setSalary] = useState(
    party?.monthlySalary != null ? String(party.monthlySalary) : '',
  );
  const [pct, setPct] = useState(party?.sharePct != null ? String(party.sharePct) : '');
  const [capital, setCapital] = useState(party?.capital != null ? String(party.capital) : '');
  const [note, setNote] = useState(party?.note ?? '');
  const [active, setActive] = useState(party?.isActive ?? true);
  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        type,
        name: name.trim(),
        phone: phone.trim(),
        note: note.trim(),
        isActive: active,
      };
      if (type === 'EMPLOYEE') body.monthlySalary = salary === '' ? null : Number(salary);
      else {
        body.sharePct = pct === '' ? null : Number(pct);
        body.capital = capital === '' ? null : Number(capital);
      }
      return party
        ? api.raw.patch(`/admin/accounting/parties/${party.id}`, body)
        : api.raw.post('/admin/accounting/parties', body);
    },
    onSuccess: () => {
      toast.success('اتحفظ');
      qc.invalidateQueries({ queryKey: ['acct'] });
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${party ? 'تعديل' : 'إضافة'} ${PARTY_LABEL[type]}`}
      size="md"
    >
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <label className="font-bold sm:col-span-2">
          الاسم
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={cn(inputCls, 'mt-1')}
          />
        </label>
        <label className="font-bold">
          الموبايل (اختياري)
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={cn(inputCls, 'mt-1')}
            dir="ltr"
          />
        </label>
        {type === 'EMPLOYEE' ? (
          <label className="font-bold">
            المرتب الشهري
            <input
              type="number"
              min={0}
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              className={cn(inputCls, 'mt-1')}
              dir="ltr"
            />
          </label>
        ) : (
          <>
            <label className="font-bold">
              نسبته من صافي الربح %
              <input
                type="number"
                min={0}
                max={100}
                value={pct}
                onChange={(e) => setPct(e.target.value)}
                className={cn(inputCls, 'mt-1')}
                dir="ltr"
              />
            </label>
            <label className="font-bold">
              رأس المال (للمعلومة)
              <input
                type="number"
                min={0}
                value={capital}
                onChange={(e) => setCapital(e.target.value)}
                className={cn(inputCls, 'mt-1')}
                dir="ltr"
              />
            </label>
          </>
        )}
        <label className="font-bold sm:col-span-2">
          ملاحظة
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={cn(inputCls, 'mt-1')}
          />
        </label>
        {party && (
          <label className="flex items-center gap-2 font-bold">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 accent-brand-red"
            />
            شغّال
          </label>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

interface StatementLine {
  month: string;
  salary?: number;
  advances?: number;
  paid?: number;
  remaining?: number;
  netProfit?: number;
  closed?: boolean;
  share?: number;
  withdrawals?: number;
  capital?: number;
  balance?: number;
}

function StatementDialog({ party, onClose }: { party: Party; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['acct', 'statement', party.id],
    queryFn: () =>
      api.raw
        .get(`/admin/accounting/parties/${party.id}/statement`)
        .then((r) => r.data.data.lines as StatementLine[]),
  });
  const emp = party.type === 'EMPLOYEE';
  const csv = () =>
    data &&
    downloadCsv(
      `كشف حساب ${party.name}`,
      emp
        ? [
            ['الشهر', 'المرتب', 'سلف', 'اتصرف', 'باقي'],
            ...data.map((l) => [l.month, l.salary, l.advances, l.paid, l.remaining]),
          ]
        : [
            ['الشهر', 'صافي ربح الشركة', 'نصيبه', 'سحب', 'رأس مال', 'الرصيد'],
            ...data.map((l) => [
              l.month,
              l.netProfit,
              l.share,
              l.withdrawals,
              l.capital,
              l.balance,
            ]),
          ],
    );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`كشف حساب: ${party.name}`} size="xl">
      <div className="space-y-3">
        <div className="flex justify-end">
          <ExportButtons onCsv={csv} />
        </div>
        {isLoading ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        ) : error || !data ? (
          <p className="text-sm text-destructive">{errMsg(error)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <Th>الشهر</Th>
                  {emp ? (
                    <>
                      <Th>المرتب</Th>
                      <Th>سلف</Th>
                      <Th>اتصرف</Th>
                      <Th>باقي</Th>
                    </>
                  ) : (
                    <>
                      <Th>صافي ربح الشركة</Th>
                      <Th>نصيبه ({party.sharePct ?? 0}%)</Th>
                      <Th>سحب</Th>
                      <Th>رأس مال</Th>
                      <Th>الرصيد المتراكم</Th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.map((l) => (
                  <tr key={l.month} className="border-b border-border/60">
                    <Td className="font-bold">
                      {monthLabel(l.month)}
                      {l.closed && <Lock className="ms-1 inline h-3 w-3 text-emerald-600" />}
                    </Td>
                    {emp ? (
                      <>
                        <Td>{money(l.salary)}</Td>
                        <Td>{money(l.advances)}</Td>
                        <Td>{money(l.paid)}</Td>
                        <Td className="font-black">{signed(l.remaining ?? 0)}</Td>
                      </>
                    ) : (
                      <>
                        <Td>{signed(l.netProfit ?? 0)}</Td>
                        <Td className="text-emerald-700">{money(l.share)}</Td>
                        <Td>{money(l.withdrawals)}</Td>
                        <Td>{money(l.capital)}</Td>
                        <Td className="font-black">{signed(l.balance ?? 0)}</Td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!emp && (
              <p className="mt-2 text-xs text-muted-foreground">
                نصيبه بيتحسب من صافي ربح الشهر (والشهر المتقفل بأرقام التقفيل). الشهر الخسران مفيهوش
                نصيب.
              </p>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
