/**
 * Shared server-pagination footer for every list screen.
 *
 * Renders "showing X–Y of TOTAL", a page-size picker (20/50/100) and prev/next
 * navigation. Purely presentational — the page owns `page`/`pageSize` state and
 * passes them to the API, so navigating never refetches the whole table.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZES = [20, 50, 100] as const;

const fmt = (n: number) => Number(n || 0).toLocaleString('ar-EG');

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  disabled = false,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
  disabled?: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 px-1 py-3 text-sm"
      data-print="hide"
    >
      <div className="text-muted-foreground">
        {total === 0 ? (
          'لا توجد نتائج'
        ) : (
          <>
            عرض <span className="font-bold text-foreground">{fmt(from)}</span>–
            <span className="font-bold text-foreground">{fmt(to)}</span> من{' '}
            <span className="font-bold text-foreground">{fmt(total)}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          لكل صفحة
          <select
            value={pageSize}
            disabled={disabled}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="px-2 py-1 rounded-lg border border-input bg-white text-sm disabled:opacity-50"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={disabled || page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-input disabled:opacity-40 hover:bg-muted"
          >
            <ChevronRight className="w-4 h-4" />
            السابق
          </button>
          <span className="px-2 text-muted-foreground whitespace-nowrap">
            {fmt(page)} / {fmt(totalPages)}
          </span>
          <button
            type="button"
            disabled={disabled || page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-input disabled:opacity-40 hover:bg-muted"
          >
            التالي
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
