/**
 * A round clock face for picking a time.
 *
 * `<input type="time">` renders as a cramped native spinner that differs on
 * every browser and reads as a form field rather than a time. Delivery windows
 * are the kind of thing you set once and want to see at a glance, so this shows
 * the hours on an actual dial: drag or click the hand, flip AM/PM, done.
 *
 * Value is 24-hour "HH:MM", the same shape `<input type="time">` produced, so
 * nothing downstream changes.
 */
import { useCallback, useRef } from 'react';

const SIZE = 176;
const R = SIZE / 2;
/** Where the numbers sit, and where the hand stops. */
const RING = R - 26;

function parse(v: string): { h: number; m: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return { h: 12, m: 0 };
  return {
    h: Math.min(23, Math.max(0, Number(m[1]))),
    m: Math.min(59, Math.max(0, Number(m[2]))),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

export function TimeDial({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  const { h, m } = parse(value);
  const isPm = h >= 12;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const ref = useRef<SVGSVGElement | null>(null);

  /** Screen point → nearest hour on the dial, keeping the current half-day. */
  const pick = useCallback(
    (clientX: number, clientY: number) => {
      const box = ref.current?.getBoundingClientRect();
      if (!box) return;
      const dx = clientX - (box.left + box.width / 2);
      const dy = clientY - (box.top + box.height / 2);
      // Screen y grows downward; rotate so 12 o'clock is straight up.
      const deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      const norm = (deg + 360) % 360;
      const slot = Math.round(norm / 30) % 12; // 0 → 12 o'clock
      const picked12 = slot === 0 ? 12 : slot;
      const h24 = isPm ? (picked12 % 12) + 12 : picked12 % 12;
      onChange(`${pad(h24)}:${pad(m)}`);
    },
    [isPm, m, onChange],
  );

  const setHalf = (pm: boolean) => {
    if (pm === isPm) return;
    onChange(`${pad(pm ? (hour12 % 12) + 12 : hour12 % 12)}:${pad(m)}`);
  };

  const angle = ((hour12 % 12) * 30 - 90) * (Math.PI / 180);
  const handX = R + Math.cos(angle) * RING;
  const handY = R + Math.sin(angle) * RING;

  return (
    <div className="flex flex-col items-center gap-2">
      {!!label && <div className="text-xs font-bold text-muted-foreground">{label}</div>}

      {/* Readout and half-day together: the AM/PM switch belongs next to the
          number it changes, not buried in the row of minute buttons. */}
      <div className="flex items-center gap-2">
        <span className="text-3xl font-black tabular-nums text-foreground" dir="ltr">
          {pad(hour12)}:{pad(m)}
        </span>
        <div className="inline-flex flex-col rounded-lg bg-muted p-0.5 text-[11px] font-bold">
          {[
            { pm: false, t: 'ص' },
            { pm: true, t: 'م' },
          ].map((o) => (
            <button
              key={o.t}
              type="button"
              onClick={() => setHalf(o.pm)}
              className={`rounded px-2 py-0.5 transition ${
                isPm === o.pm ? 'bg-brand-red text-white' : 'text-muted-foreground'
              }`}
            >
              {o.t}
            </button>
          ))}
        </div>
      </div>

      <svg
        ref={ref}
        width={SIZE}
        height={SIZE}
        className="touch-none cursor-pointer select-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pick(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) pick(e.clientX, e.clientY);
        }}
        role="slider"
        aria-label={label ?? 'الساعة'}
        aria-valuenow={hour12}
        aria-valuemin={1}
        aria-valuemax={12}
      >
        <circle cx={R} cy={R} r={R - 2} className="fill-muted/50 stroke-border" strokeWidth={1} />
        <line
          x1={R}
          y1={R}
          x2={handX}
          y2={handY}
          className="stroke-brand-red"
          strokeWidth={2}
          strokeLinecap="round"
        />
        <circle cx={handX} cy={handY} r={15} className="fill-brand-red" />
        <circle cx={R} cy={R} r={3} className="fill-brand-red" />
        {Array.from({ length: 12 }, (_, i) => {
          const n = i === 0 ? 12 : i;
          const a = (i * 30 - 90) * (Math.PI / 180);
          const x = R + Math.cos(a) * RING;
          const y = R + Math.sin(a) * RING;
          const on = n === hour12;
          return (
            <text
              key={n}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              className={`text-[13px] font-bold ${on ? 'fill-white' : 'fill-foreground'}`}
            >
              {n}
            </text>
          );
        })}
      </svg>

      {/* Minutes on their own labelled row. Delivery runs leave on the quarter
          hour, so this is a short list rather than a second dial — but a value
          that came from elsewhere (an odd :07) still shows, and gets its own
          chip so it is selectable rather than silently unrepresented. */}
      <div className="w-full">
        <div className="mb-1 text-[11px] font-bold text-muted-foreground">الدقائق</div>
        <div className="grid grid-cols-4 gap-1.5">
          {Array.from(new Set([0, 15, 30, 45, m]))
            .sort((a, b) => a - b)
            .map((mm) => (
              <button
                key={mm}
                type="button"
                onClick={() => onChange(`${pad(h)}:${pad(mm)}`)}
                className={`rounded-lg py-1.5 text-xs font-bold tabular-nums transition ${
                  m === mm
                    ? 'bg-brand-red text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70'
                }`}
              >
                {pad(mm)}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
