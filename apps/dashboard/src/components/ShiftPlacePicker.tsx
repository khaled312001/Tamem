import { MapPin } from 'lucide-react';
import { useState } from 'react';

import { cn } from '../lib/utils.js';

/**
 * Where a driver waits during a shift (المكتب، الاسكندراني…). One tap on a
 * known place, «بدون» to clear, or type a new one. The list is the office's
 * (قواعد الحجز → الأماكن) plus any place already on a shift.
 */
export function ShiftPlacePicker({
  places,
  value,
  onChange,
}: {
  places: string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const custom = value !== null && !places.includes(value);
  const [typing, setTyping] = useState(custom);
  const chip = (on: boolean) =>
    cn(
      'rounded-lg border px-3 py-1.5 text-xs font-bold transition',
      on
        ? 'border-brand-red bg-brand-red text-white'
        : 'border-border bg-muted text-muted-foreground',
    );
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1 text-sm font-bold">
        <MapPin className="h-4 w-4 text-brand-red" /> المكان
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className={chip(value === null && !typing)}
          onClick={() => {
            setTyping(false);
            onChange(null);
          }}
        >
          بدون
        </button>
        {places.map((p) => (
          <button
            type="button"
            key={p}
            className={chip(value === p && !typing)}
            onClick={() => {
              setTyping(false);
              onChange(p);
            }}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          className={chip(typing)}
          onClick={() => {
            setTyping(true);
            onChange(custom ? value : '');
          }}
        >
          + مكان تاني
        </button>
      </div>
      {typing && (
        <input
          autoFocus
          value={value ?? ''}
          maxLength={60}
          onChange={(e) => onChange(e.target.value)}
          placeholder="اكتب اسم المكان"
          className="mt-2 w-full rounded-lg border border-input bg-popover px-3 py-2 text-sm"
        />
      )}
    </div>
  );
}

/** Sends '' as «no place»: the server stores both as empty. */
export const placeOut = (v: string | null) => (v ?? '').trim() || null;
