import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '../../lib/utils.js';

export interface Crumb {
  label: string;
  to?: string;
}

/**
 * Unified page header: title (+ optional icon), subtitle, breadcrumbs, and a
 * right-aligned actions slot. Replaces the ad-hoc `<div><h1>…</h1></div>`
 * headers scattered across every route.
 */
export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  crumbs,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  crumbs?: Crumb[];
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        {crumbs && crumbs.length > 0 && (
          <nav className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="w-3 h-3 opacity-60" />}
                {c.to ? (
                  <Link to={c.to} className="hover:text-brand-red transition">
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-foreground/70">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-2">
          {Icon && (
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-brand-red/10 text-brand-red shrink-0">
              <Icon className="w-5 h-5" />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-black text-brand-dark truncate">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
