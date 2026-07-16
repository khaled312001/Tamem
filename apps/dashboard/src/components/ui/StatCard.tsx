import { ChevronLeft, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { cn } from '../../lib/utils.js';
import { TONE, type Tone } from '../../lib/statusRegistry.js';

export interface StatCardProps {
  label: string;
  value: number | string;
  icon?: LucideIcon;
  hint?: string;
  tone?: Tone;
  /** When set, the whole card is a link (clickable KPI → pre-filtered list). */
  to?: string;
  /** Stronger, colored treatment for "needs action" cards. */
  emphasis?: boolean;
}

/**
 * Clickable KPI card. Accent comes from the status-registry TONE map (static
 * classes — no dynamic `text-${x}` that Tailwind can't see). When `to` is set
 * the card links to a pre-filtered route so KPIs aren't dead-ends.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = 'zinc',
  to,
  emphasis,
}: StatCardProps) {
  const t = TONE[tone];
  const inner = (
    <div
      className={cn(
        'group relative h-full rounded-xl border p-4 md:p-5 transition-all',
        emphasis
          ? cn(t.soft, 'border-transparent shadow-sm hover:shadow-md')
          : 'bg-card border-border shadow-sm hover:shadow-md hover:border-border',
        to && 'cursor-pointer hover:-translate-y-0.5',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm text-muted-foreground font-medium">{label}</div>
        {Icon && (
          <div className={cn('rounded-lg p-1.5', emphasis ? 'bg-white/70' : t.soft)}>
            <Icon className={cn('w-4 h-4', t.text)} />
          </div>
        )}
      </div>
      <div className="mt-2 text-2xl md:text-3xl font-black text-foreground tabular-nums">
        {value}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : <span />}
        {to && (
          <ChevronLeft className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition -translate-x-1 group-hover:translate-x-0" />
        )}
      </div>
    </div>
  );

  return to ? (
    <Link
      to={to}
      className="block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40 rounded-xl"
    >
      {inner}
    </Link>
  ) : (
    inner
  );
}
