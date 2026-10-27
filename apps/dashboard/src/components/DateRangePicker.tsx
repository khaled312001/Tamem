import { CalendarRange } from 'lucide-react';

import { RANGE_PRESETS, todayYmd, type DateRange } from '../lib/dateRange.js';

interface Props {
  value: DateRange | null;
  onChange: (next: DateRange | null) => void;
  /** Adds a first «الكل» choice that clears the range (the orders list). */
  allowAll?: boolean;
}

/**
 * Preset periods + «مخصص» with two date boxes. Picking «مخصص» starts on today
 * for both days, so the range is always complete and the page never waits on a
 * half-filled filter.
 */
export function DateRangePicker({ value, onChange, allowAll }: Props) {
  const btn = (active: boolean) =>
    `px-3 py-1.5 text-sm rounded-md transition whitespace-nowrap ${
      active ? 'bg-brand-red text-white font-bold' : 'text-muted-foreground hover:bg-muted'
    }`;
  const isCustom = value?.key === 'custom';
  const today = todayYmd();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="bg-card border border-border rounded-lg p-1 flex flex-wrap">
        {allowAll && (
          <button type="button" onClick={() => onChange(null)} className={btn(value === null)}>
            الكل
          </button>
        )}
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange({ key: p.key })}
            className={btn(value?.key === p.key)}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() =>
            onChange({ key: 'custom', from: value?.from ?? today, to: value?.to ?? today })
          }
          className={`${btn(isCustom)} inline-flex items-center gap-1`}
        >
          <CalendarRange className="w-3.5 h-3.5" />
          مخصص
        </button>
      </div>
      {isCustom && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1.5">
            <span className="text-muted-foreground">من</span>
            <input
              type="date"
              value={value.from ?? ''}
              max={today}
              onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })}
              className="px-2 py-1.5 rounded-lg border border-input bg-white outline-none focus:ring-2 focus:ring-brand-red/20"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-muted-foreground">إلى</span>
            <input
              type="date"
              value={value.to ?? ''}
              max={today}
              onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })}
              className="px-2 py-1.5 rounded-lg border border-input bg-white outline-none focus:ring-2 focus:ring-brand-red/20"
            />
          </label>
        </div>
      )}
    </div>
  );
}
