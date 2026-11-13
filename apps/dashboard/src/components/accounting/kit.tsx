/**
 * Shared pieces of the «الحسابات» pages: types that mirror the shim's
 * /admin/accounting/* answers, Arabic labels, month/day pickers, CSV export and
 * the receipt upload.
 */
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, Printer } from 'lucide-react';
import type { ReactNode } from 'react';

import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import { formatMoney } from '../../lib/format.js';
import { cn } from '../../lib/utils.js';
import { Button } from '../ui/Button.js';

export type Kind = 'EXPENSE' | 'INCOME' | 'ADVANCE' | 'WITHDRAWAL' | 'CAPITAL';
export type Method = 'CASH' | 'BANK' | 'WALLET';
export type PartyType = 'EMPLOYEE' | 'INVESTOR' | 'OWNER';

export const KIND_LABEL: Record<Kind, string> = {
  EXPENSE: 'مصروف',
  INCOME: 'إيراد آخر',
  ADVANCE: 'سلفة',
  WITHDRAWAL: 'مسحوبات شريك',
  CAPITAL: 'إيداع رأس مال',
};
export const KIND_HINT: Record<Kind, string> = {
  EXPENSE: 'إيجار، بنزين، فواتير، مرتبات… بيتخصم من الربح',
  INCOME: 'فلوس دخلت من برّه الطلبات (إعلانات، اشتراكات…)، وبتتزود على الربح',
  ADVANCE: 'فلوس اتدفعت مقدّم لموظف أو مندوب: مش مصروف، بتتخصم من مستحقه',
  WITHDRAWAL: 'شريك أو مستثمر سحب من أرباحه: مش مصروف على الشركة',
  CAPITAL: 'شريك أو مستثمر حط فلوس في الشركة: مش إيراد',
};
export const KIND_TONE: Record<Kind, string> = {
  EXPENSE: 'bg-red-50 text-red-700 border-red-200',
  INCOME: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ADVANCE: 'bg-amber-50 text-amber-800 border-amber-200',
  WITHDRAWAL: 'bg-purple-50 text-purple-700 border-purple-200',
  CAPITAL: 'bg-sky-50 text-sky-700 border-sky-200',
};
export const METHOD_LABEL: Record<Method, string> = {
  CASH: 'كاش',
  BANK: 'بنك',
  WALLET: 'محفظة / إنستاباي',
};
export const PARTY_LABEL: Record<PartyType | 'DRIVER', string> = {
  EMPLOYEE: 'موظف',
  INVESTOR: 'مستثمر',
  OWNER: 'شريك / صاحب الشركة',
  DRIVER: 'مندوب',
};

export interface Party {
  id: string;
  type: PartyType;
  name: string;
  phone: string | null;
  monthlySalary: number | null;
  sharePct: number | null;
  capital: number | null;
  note: string | null;
  isActive: boolean;
}
export interface Meta {
  categories: Record<Kind, string[]>;
  parties: Party[];
  drivers: { id: string; name: string }[];
  canReopen: boolean;
  today: string;
  thisMonth: string;
}
export interface Entry {
  id: string;
  kind: Kind;
  category: string;
  amount: number;
  entryDate: string;
  method: Method;
  partyType: PartyType | 'DRIVER' | null;
  partyId: string | null;
  partyName: string | null;
  note: string | null;
  receipt: string | null;
  recurringId: string | null;
  createdByName: string | null;
  createdAt: string;
  locked: boolean;
}
export interface OrderMoney {
  orders: number;
  sales: number;
  cashSales: number;
  goods: number;
  fees: number;
  commission: number;
  discounts: number;
  driverShares: number;
  merchantPayouts: number;
  companyNet: number;
  feeMissing: number;
}
export interface Pnl {
  from: string;
  to: string;
  orders: OrderMoney;
  driverIncentives: number;
  operatingNet: number;
  otherIncome: number;
  incomeByCategory: { category: string; amount: number; count: number }[];
  expenses: number;
  expensesByCategory: { category: string; amount: number; count: number }[];
  advances: number;
  withdrawals: number;
  capital: number;
  revenue: number;
  netProfit: number;
  marginPct: number | null;
  cashByMethod: Record<Method, { in: number; out: number; net: number }>;
  driverSettlements: { amount: number; count: number };
  byDay?: {
    day: string;
    orders: number;
    companyNet: number;
    income: number;
    expenses: number;
    net: number;
  }[];
}
export interface DriverLine {
  driverId: string;
  name: string;
  phone: string | null;
  orders: number;
  sales: number;
  cashSales: number;
  fees: number;
  share: number;
  company: number;
  settled: number;
  advances: number;
  unsettled: number;
}
export interface Closed {
  type: 'DAY' | 'MONTH';
  period: string;
  note: string | null;
  closedByName: string | null;
  closedAt: string;
  netProfit: number | null;
  changed: boolean;
}

export const money = (n: number | null | undefined) => formatMoney(n ?? 0);
/** Signed money with an explicit minus, for P&L lines. */
export const signed = (n: number) => (n < 0 ? `− ${formatMoney(-n)}` : formatMoney(n));
export const errMsg = (e: unknown): string =>
  (e as { messageAr?: string })?.messageAr || (e as Error)?.message || 'حصلت مشكلة';

export function useAcctMeta() {
  return useQuery({
    queryKey: ['acct', 'meta'],
    queryFn: () => api.raw.get('/admin/accounting/meta').then((r) => r.data.data as Meta),
    staleTime: 60_000,
  });
}

const AR_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];
const AR_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const monthLabel = (ym: string) =>
  `${AR_MONTHS[Number(ym.slice(5, 7)) - 1] ?? ''} ${ym.slice(0, 4)}`;
export const dayLabel = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  return `${AR_DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${AR_MONTHS[d.getUTCMonth()]}`;
};
export const shiftMonth = (ym: string, n: number) => {
  const d = new Date(`${ym}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};
/** Last day of a YYYY-MM month. */
export const monthEnd = (ym: string) =>
  new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10);
export const shiftDay = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** ‹ month › with a native month input in the middle. RTL: the right arrow goes back. */
export function MonthNav({
  value,
  onChange,
  max,
}: {
  value: string;
  onChange: (v: string) => void;
  max?: string;
}) {
  return (
    <div className="inline-flex items-center gap-1" data-print="hide">
      <button
        className="rounded-lg border border-border bg-card p-1.5 hover:bg-muted"
        title="الشهر اللي قبله"
        onClick={() => onChange(shiftMonth(value, -1))}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      <input
        type="month"
        value={value}
        max={max}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm font-bold"
      />
      <button
        className="rounded-lg border border-border bg-card p-1.5 hover:bg-muted disabled:opacity-30"
        title="الشهر اللي بعده"
        disabled={!!max && value >= max}
        onClick={() => onChange(shiftMonth(value, 1))}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
    </div>
  );
}
export function DayNav({
  value,
  onChange,
  max,
}: {
  value: string;
  onChange: (v: string) => void;
  max?: string;
}) {
  return (
    <div className="inline-flex items-center gap-1" data-print="hide">
      <button
        className="rounded-lg border border-border bg-card p-1.5 hover:bg-muted"
        title="اليوم اللي قبله"
        onClick={() => onChange(shiftDay(value, -1))}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      <input
        type="date"
        value={value}
        max={max}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm font-bold"
      />
      <button
        className="rounded-lg border border-border bg-card p-1.5 hover:bg-muted disabled:opacity-30"
        title="اليوم اللي بعده"
        disabled={!!max && value >= max}
        onClick={() => onChange(shiftDay(value, 1))}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-2xl border border-border bg-card p-4', className)}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h3 className="text-base font-black">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Download rows as a CSV that Excel opens in Arabic (UTF-8 BOM). */
export function downloadCsv(name: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob(['﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name.endsWith('.csv') ? name : `${name}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function ExportButtons({ onCsv }: { onCsv?: () => void }) {
  return (
    <span className="inline-flex gap-2" data-print="hide">
      {onCsv && (
        <Button size="sm" variant="outline" onClick={onCsv}>
          <Download className="h-4 w-4" /> Excel
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={() => window.print()}>
        <Printer className="h-4 w-4" /> طباعة
      </Button>
    </span>
  );
}

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1';
/** A receipt photo or PDF → its private ref. Raw fetch so the browser sets the multipart boundary. */
export async function uploadReceipt(file: File): Promise<string> {
  const token = useAuth.getState().tokens?.accessToken;
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${baseURL}/admin/accounting/receipt`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  const body = (await res.json().catch(() => null)) as {
    data?: { ref?: string };
    error?: { messageAr?: string; message?: string };
  } | null;
  if (!res.ok || !body?.data?.ref)
    throw new Error(body?.error?.messageAr || body?.error?.message || 'الملف مارفعش');
  return body.data.ref;
}

/** "+12%" against the month before; null when there is nothing to compare. */
export function changePct(now: number, before: number): string | null {
  if (!before) return null;
  const p = ((now - before) / Math.abs(before)) * 100;
  if (!Number.isFinite(p)) return null;
  return `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(0)}% عن الشهر اللي قبله`;
}
