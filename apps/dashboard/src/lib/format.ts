/**
 * Unified number / money / date formatting for the whole dashboard.
 *
 * The audit found `1234` next to `١٬٢٣٤ ج.م` on the same screen. We standardise
 * on Latin digits with Arabic-locale grouping (`ar-EG-u-nu-latn`) — fastest to
 * read for delivery-ops — applied to every KPI, table cell, tooltip and axis.
 */
const countFmt = new Intl.NumberFormat('ar-EG-u-nu-latn');
const moneyFmt = new Intl.NumberFormat('ar-EG-u-nu-latn', {
  maximumFractionDigits: 2,
});

/** A plain integer/count: `1,234`. */
export function formatCount(n: number | string | null | undefined): string {
  const v = typeof n === 'string' ? Number(n) : (n ?? 0);
  return countFmt.format(Number.isFinite(v) ? v : 0);
}

/** Money in EGP: `1,234 ج.م` (unit optional). */
export function formatMoney(
  n: number | string | null | undefined,
  opts: { unit?: boolean } = {},
): string {
  const v = typeof n === 'string' ? Number(n) : (n ?? 0);
  const s = moneyFmt.format(Number.isFinite(v) ? v : 0);
  return opts.unit === false ? s : `${s} ج.م`;
}

/** Short date `16/7` in Cairo — used on chart axes and compact cells. */
export function formatShortDate(iso: string): string {
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

const AR_WEEKDAYS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

/** `السبت 16/7` — weekday + day/month, readable on trend charts. */
export function formatWeekdayDate(iso: string): string {
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
  return `${AR_WEEKDAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

/**
 * Parse a timestamp as an absolute instant. If the string carries no timezone
 * (a naive `YYYY-MM-DD HH:MM:SS` from a backend that stores UTC), treat it as
 * UTC — otherwise the browser parses it as local time and Cairo shows it 3h off.
 */
function parseInstant(iso: string): Date {
  const hasTz = /[Zz]$|[+-]\d\d:?\d\d$/.test(iso);
  if (hasTz) return new Date(iso);
  return new Date(
    iso
      .trim()
      .replace(' ', 'T')
      .replace(/\.\d+$/, '') + 'Z',
  );
}

/** Date + time in Cairo, Latin digits: `16/7/2026 4:02 م`. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return parseInstant(iso).toLocaleString('ar-EG-u-nu-latn', {
      timeZone: 'Africa/Cairo',
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return '—';
  }
}

/** Date only in Cairo, Latin digits: `16/7/2026`. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return parseInstant(iso).toLocaleDateString('ar-EG-u-nu-latn', {
      timeZone: 'Africa/Cairo',
      dateStyle: 'short',
    });
  } catch {
    return '—';
  }
}
