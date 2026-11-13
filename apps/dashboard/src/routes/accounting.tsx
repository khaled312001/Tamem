/**
 * «الحسابات» — the accountant's page.
 *
 * Order money is read from the orders themselves (commission, delivery fees,
 * the drivers' share, discounts), exactly as the reports count it. Everything
 * the orders can't know is entered here: expenses, other income, advances,
 * partners' withdrawals and capital, fixed monthly costs and installments.
 * Days and months are closed (snapshot + lock) for the owner, the partners, the
 * employees and the drivers.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  LayoutDashboard,
  Loader2,
  Repeat,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';

import {
  changePct,
  errMsg,
  METHOD_LABEL,
  money,
  MonthNav,
  monthLabel,
  Panel,
  signed,
  useAcctMeta,
  type Method,
  type Pnl,
} from '../components/accounting/kit.js';
import { Button } from '../components/ui/Button.js';
import { StatCard } from '../components/ui/StatCard.js';
import { api } from '../lib/api.js';
import { cn } from '../lib/utils.js';
import { DayClosing, MonthClosing, PeopleTab } from './accounting-close.js';
import { LedgerTab, RecurringTab } from './accounting-ledger.js';

const TABS = [
  { key: 'overview', label: 'نظرة عامة', icon: LayoutDashboard },
  { key: 'ledger', label: 'الحركات اليومية', icon: BookOpen },
  { key: 'recurring', label: 'المصروفات الثابتة والأقساط', icon: Repeat },
  { key: 'day', label: 'التقفيل اليومي', icon: CalendarCheck },
  { key: 'month', label: 'التقفيل الشهري', icon: CalendarDays },
  { key: 'people', label: 'الموظفين والشركاء', icon: Users },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export function AccountingPage() {
  const [sp, setSp] = useSearchParams();
  const meta = useAcctMeta();
  const tab = (TABS.find((t) => t.key === sp.get('tab'))?.key ?? 'overview') as TabKey;
  const thisMonth = meta.data?.thisMonth ?? new Date().toISOString().slice(0, 7);
  const month = sp.get('month') || thisMonth;
  const setParam = (k: string, v: string) =>
    setSp(
      (p) => {
        const n = new URLSearchParams(p);
        n.set(k, v);
        return n;
      },
      { replace: true },
    );

  if (meta.isError)
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-6 text-center">
        <p className="font-black">صفحة الحسابات</p>
        <p className="mt-2 text-sm text-muted-foreground">{errMsg(meta.error)}</p>
      </div>
    );

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xl font-black">
          <Wallet className="h-6 w-6 text-brand-red" /> الحسابات
        </div>
      </div>
      <div className="flex flex-wrap gap-2" data-print="hide">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setParam('tab', t.key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-bold transition',
              tab === t.key
                ? 'border-brand-red bg-brand-red text-white'
                : 'border-border bg-card text-muted-foreground hover:border-foreground/30',
            )}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>
      {meta.isLoading || !meta.data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-brand-red" />
        </div>
      ) : tab === 'overview' ? (
        <Overview month={month} onMonth={(v) => setParam('month', v)} max={thisMonth} />
      ) : tab === 'ledger' ? (
        <LedgerTab meta={meta.data} />
      ) : tab === 'recurring' ? (
        <RecurringTab meta={meta.data} month={month} onMonth={(v) => setParam('month', v)} />
      ) : tab === 'day' ? (
        <DayClosing
          meta={meta.data}
          day={sp.get('day') || meta.data.today}
          onDay={(v) => setParam('day', v)}
        />
      ) : tab === 'month' ? (
        <MonthClosing meta={meta.data} month={month} onMonth={(v) => setParam('month', v)} />
      ) : (
        <PeopleTab meta={meta.data} />
      )}
    </div>
  );
}

interface OverviewData extends Pnl {
  month: string;
  previous: { month: string; netProfit: number; revenue: number; expenses: number };
  trend: {
    month: string;
    revenue: number;
    expenses: number;
    operatingNet: number;
    netProfit: number;
    orders: number;
    closed: boolean;
  }[];
  recurringDue: { count: number; amount: number };
  closed: boolean;
}

function Overview({
  month,
  onMonth,
  max,
}: {
  month: string;
  onMonth: (v: string) => void;
  max: string;
}) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['acct', 'overview', month],
    queryFn: () =>
      api.raw
        .get('/admin/accounting/overview', { params: { month } })
        .then((r) => r.data.data as OverviewData),
  });
  const postDue = useMutation({
    mutationFn: () => api.raw.post('/admin/accounting/recurring/post-due', { month }),
    onSuccess: (r) => {
      const d = r.data.data as { posted: number; skippedClosed: number };
      toast.success(`اتسجّل ${d.posted} مصروف ثابت`);
      qc.invalidateQueries({ queryKey: ['acct'] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthNav value={month} onChange={onMonth} max={max} />
        {data?.closed && (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
            الشهر ده متقفل
          </span>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-brand-red" />
        </div>
      ) : error || !data ? (
        <p className="text-sm text-destructive">{errMsg(error)}</p>
      ) : (
        <>
          {data.recurringDue.count > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <span>
                فيه <b>{data.recurringDue.count}</b> مصروف ثابت أو قسط مستحق في {monthLabel(month)}{' '}
                ولسه ماتسجلش ({money(data.recurringDue.amount)}). الربح تحت مش شايفهم لحد ما
                يتسجلوا.
              </span>
              <Button size="sm" onClick={() => postDue.mutate()} disabled={postDue.isPending}>
                {postDue.isPending && <Loader2 className="h-4 w-4 animate-spin" />} سجّلهم كلهم
              </Button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="صافي الربح"
              value={signed(data.netProfit)}
              icon={data.netProfit >= 0 ? TrendingUp : TrendingDown}
              tone={data.netProfit >= 0 ? 'green' : 'red'}
              emphasis
              hint={changePct(data.netProfit, data.previous.netProfit) ?? undefined}
            />
            <StatCard
              label="إيرادات الشركة"
              value={money(data.revenue)}
              icon={Wallet}
              tone="blue"
              hint="عمولة + توصيل + إيرادات أخرى"
            />
            <StatCard
              label="المصروفات"
              value={money(data.expenses)}
              icon={TrendingDown}
              tone="amber"
              hint={changePct(data.expenses, data.previous.expenses) ?? undefined}
            />
            <StatCard
              label="الطلبات المسلّمة"
              value={data.orders.orders}
              icon={CalendarClock}
              tone="zinc"
              hint={`الشركة كسبت منهم ${money(data.orders.companyNet)}`}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-5">
            <Panel title={`قائمة الدخل: ${monthLabel(month)}`} className="lg:col-span-3">
              <PnlStatement p={data} />
            </Panel>
            <div className="space-y-4 lg:col-span-2">
              <Panel title="المصروفات حسب البند">
                <CategoryBars rows={data.expensesByCategory} total={data.expenses} />
              </Panel>
              <Panel title="حركة الفلوس حسب طريقة الدفع">
                <CashTable cash={data.cashByMethod} />
              </Panel>
            </div>
          </div>
          <Panel title="آخر 6 شهور">
            <TrendChart rows={data.trend} />
          </Panel>
          {data.byDay && (
            <Panel title={`صافي كل يوم في ${monthLabel(month)}`}>
              <DailyChart rows={data.byDay} />
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

function Line2({
  label,
  value,
  strong,
  sub,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  sub?: boolean;
  tone?: 'plus' | 'minus' | 'total';
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 py-1.5 text-sm',
        sub && 'ps-4 text-muted-foreground',
        strong && 'border-t border-border pt-2 font-black',
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          'tabular-nums',
          tone === 'plus' && 'text-emerald-700',
          tone === 'minus' && 'text-red-600',
          strong && 'text-base',
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** The month's income statement, top to bottom. Also used by the month closing. */
export function PnlStatement({ p }: { p: Pnl }) {
  const o = p.orders;
  return (
    <div>
      <Line2 label={`الطلبات المسلّمة (${o.orders} طلب)`} value={`مبيعات ${money(o.sales)}`} sub />
      <Line2 label="عمولة التجار" value={`+ ${money(o.commission)}`} tone="plus" />
      <Line2 label="رسوم التوصيل" value={`+ ${money(o.fees)}`} tone="plus" />
      <Line2 label="نصيب المناديب من التوصيل" value={`− ${money(o.driverShares)}`} tone="minus" />
      {o.discounts > 0 && (
        <Line2 label="خصومات وكوبونات" value={`− ${money(o.discounts)}`} tone="minus" />
      )}
      <Line2 label="صافي الشركة من الطلبات" value={signed(o.companyNet)} strong />
      {p.driverIncentives !== 0 && (
        <Line2
          label="بونص المناديب (بعد الخصومات) المدفوع"
          value={
            p.driverIncentives > 0
              ? `− ${money(p.driverIncentives)}`
              : `+ ${money(-p.driverIncentives)}`
          }
          tone={p.driverIncentives > 0 ? 'minus' : 'plus'}
        />
      )}
      {p.otherIncome > 0 && (
        <>
          <Line2 label="إيرادات أخرى" value={`+ ${money(p.otherIncome)}`} tone="plus" />
          {p.incomeByCategory.map((c) => (
            <Line2 key={c.category} label={c.category} value={money(c.amount)} sub />
          ))}
        </>
      )}
      <Line2 label="المصروفات" value={`− ${money(p.expenses)}`} tone="minus" />
      {p.expensesByCategory.map((c) => (
        <Line2 key={c.category} label={`${c.category} (${c.count})`} value={money(c.amount)} sub />
      ))}
      <div
        className={cn(
          'mt-2 flex items-center justify-between rounded-xl px-3 py-2.5 text-base font-black',
          p.netProfit >= 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700',
        )}
      >
        <span>صافي الربح</span>
        <span className="tabular-nums">
          {signed(p.netProfit)}
          {p.marginPct !== null && (
            <span className="ms-2 text-xs font-bold">({p.marginPct}% من الإيرادات)</span>
          )}
        </span>
      </div>
      {(p.advances > 0 || p.withdrawals > 0 || p.capital > 0) && (
        <div className="mt-3 rounded-xl border border-dashed border-border p-2.5 text-xs text-muted-foreground">
          <p className="mb-1 font-bold text-foreground">حركات مش داخلة في الربح:</p>
          {p.advances > 0 && <p>سلف لموظفين ومناديب: {money(p.advances)}</p>}
          {p.withdrawals > 0 && <p>مسحوبات الشركاء: {money(p.withdrawals)}</p>}
          {p.capital > 0 && <p>رأس مال اتحط: {money(p.capital)}</p>}
        </div>
      )}
      {o.feeMissing > 0 && (
        <p className="mt-2 text-xs text-amber-700">
          {o.feeMissing} طلب مسلّم من غير رسوم توصيل متسجلة، فاتحسبوا على صفر.
        </p>
      )}
    </div>
  );
}

function CategoryBars({
  rows,
  total,
}: {
  rows: { category: string; amount: number }[];
  total: number;
}) {
  if (!rows.length)
    return <p className="text-sm text-muted-foreground">مفيش مصروفات متسجلة في الشهر ده.</p>;
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const pct = total > 0 ? Math.round((r.amount / total) * 100) : 0;
        return (
          <div key={r.category} className="text-sm">
            <div className="flex justify-between gap-2">
              <span className="font-bold">{r.category}</span>
              <span className="tabular-nums text-muted-foreground">
                {money(r.amount)} · {pct}%
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-brand-red/70" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CashTable({ cash }: { cash: Pnl['cashByMethod'] }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-muted-foreground">
        <tr>
          <th className="py-1 text-start">الطريقة</th>
          <th className="py-1 text-start">دخل</th>
          <th className="py-1 text-start">خرج</th>
          <th className="py-1 text-start">الصافي</th>
        </tr>
      </thead>
      <tbody>
        {(Object.keys(cash) as Method[]).map((m) => (
          <tr key={m} className="border-t border-border">
            <td className="py-1.5 font-bold">{METHOD_LABEL[m]}</td>
            <td className="py-1.5 tabular-nums text-emerald-700">{money(cash[m].in)}</td>
            <td className="py-1.5 tabular-nums text-red-600">{money(cash[m].out)}</td>
            <td className="py-1.5 tabular-nums font-bold">{signed(cash[m].net)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TrendChart({ rows }: { rows: OverviewData['trend'] }) {
  const data = rows.map((r) => ({ ...r, label: monthLabel(r.month).split(' ')[0] }));
  return (
    <div dir="ltr">
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} reversed />
          <YAxis tick={{ fontSize: 11 }} orientation="right" width={56} />
          <Tooltip formatter={(v: number, n: string) => [money(v), n]} />
          <Bar dataKey="revenue" name="الإيرادات" fill="#60a5fa" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expenses" name="المصروفات" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          <Line dataKey="netProfit" name="صافي الربح" stroke="#E0301E" strokeWidth={2.5} dot />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function DailyChart({ rows }: { rows: NonNullable<Pnl['byDay']> }) {
  const data = rows.map((r) => ({ ...r, label: String(Number(r.day.slice(8, 10))) }));
  return (
    <div dir="ltr">
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} reversed interval={0} />
          <YAxis tick={{ fontSize: 11 }} orientation="right" width={56} />
          <Tooltip
            formatter={(v: number, n: string) => [money(v), n]}
            labelFormatter={(l) => `يوم ${l}`}
          />
          <Bar dataKey="companyNet" name="صافي الطلبات" fill="#34d399" radius={[3, 3, 0, 0]} />
          <Bar dataKey="expenses" name="مصروفات" fill="#f59e0b" radius={[3, 3, 0, 0]} />
          <Line dataKey="net" name="صافي اليوم" stroke="#E0301E" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
