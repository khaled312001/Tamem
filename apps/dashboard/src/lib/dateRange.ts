/**
 * The period picker shared by «نظرة عامة» and «الطلبات».
 *
 * The rules mirror adminRangeWindow() in api.php — the overview sends the key
 * and lets the server resolve it, the orders page resolves it here and sends
 * ISO bounds — so the same choice means the same days on both pages.
 */
export type RangeKey = 'today' | 'week' | 'month' | 'month1' | 'month3' | 'year' | 'custom';

export interface DateRange {
  key: RangeKey;
  /** YYYY-MM-DD, local day — only for `custom`. */
  from?: string;
  to?: string;
}

export const RANGE_PRESETS: { key: Exclude<RangeKey, 'custom'>; label: string }[] = [
  { key: 'today', label: 'اليوم' },
  { key: 'week', label: 'آخر ٧ أيام' },
  { key: 'month', label: 'هذا الشهر' },
  { key: 'month1', label: 'آخر شهر' },
  { key: 'month3', label: 'آخر ٣ شهور' },
  { key: 'year', label: 'آخر سنة' },
];

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isRangeKey(v: unknown): v is RangeKey {
  return v === 'custom' || RANGE_PRESETS.some((p) => p.key === v);
}

/** A custom range is usable only once both days are picked. */
export function isCompleteRange(r: DateRange): boolean {
  return r.key !== 'custom' || (!!r.from && DAY.test(r.from) && !!r.to && DAY.test(r.to));
}

/** Both days ordered, whichever was picked first. */
function orderedDays(r: DateRange): [string, string] {
  const a = r.from ?? '';
  const b = r.to ?? '';
  return a <= b ? [a, b] : [b, a];
}

function dayLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${d}/${m}/${y}`;
}

export function rangeLabel(r: DateRange): string {
  if (r.key !== 'custom') return RANGE_PRESETS.find((p) => p.key === r.key)?.label ?? '';
  if (!isCompleteRange(r)) return 'فترة مخصصة';
  const [a, b] = orderedDays(r);
  return a === b ? `يوم ${dayLabel(a)}` : `من ${dayLabel(a)} إلى ${dayLabel(b)}`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Start/end instants of the range, in the browser's (the office's) time. */
export function rangeBounds(r: DateRange, now = new Date()): { from: Date; to: Date } | null {
  if (!isCompleteRange(r)) return null;
  const today = startOfDay(now);
  const back = (fn: (d: Date) => void) => {
    const d = new Date(today);
    fn(d);
    return { from: d, to: now };
  };
  switch (r.key) {
    case 'today':
      return { from: today, to: now };
    case 'week':
      return back((d) => d.setDate(d.getDate() - 6));
    case 'month':
      return back((d) => d.setDate(1));
    case 'month1':
      return back((d) => d.setMonth(d.getMonth() - 1));
    case 'month3':
      return back((d) => d.setMonth(d.getMonth() - 3));
    case 'year':
      return back((d) => d.setFullYear(d.getFullYear() - 1));
    case 'custom': {
      const [a, b] = orderedDays(r);
      const from = new Date(`${a}T00:00:00`);
      const to = new Date(`${b}T23:59:59.999`);
      return { from, to: to > now ? now : to };
    }
  }
}

/** Query params for endpoints that resolve the range themselves (overview, analytics). */
export function rangeParams(r: DateRange): { range: string; from?: string; to?: string } {
  if (r.key !== 'custom' || !isCompleteRange(r))
    return { range: r.key === 'custom' ? 'week' : r.key };
  const [from, to] = orderedDays(r);
  return { range: 'custom', from, to };
}

/** Today as YYYY-MM-DD in local time — the `max` for the date inputs. */
export function todayYmd(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
