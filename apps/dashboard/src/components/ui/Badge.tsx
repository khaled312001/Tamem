import { HelpCircle } from 'lucide-react';

import type { OrderStatus } from '@tamem/types';

import { cn } from '../../lib/utils.js';
import {
  DRIVER_STATUS,
  ORDER_STATUS,
  PAYMENT_STATUS,
  TONE,
  type StatusMeta,
} from '../../lib/statusRegistry.js';

const UNKNOWN = (label: string): StatusMeta => ({ label, tone: 'zinc', icon: HelpCircle });

/** Shared soft pill built from a registry entry (label + tone + icon). */
function StatusPill({
  meta,
  size = 'sm',
  withIcon = true,
}: {
  meta: StatusMeta;
  size?: 'sm' | 'md';
  withIcon?: boolean;
}) {
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-bold whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        TONE[meta.tone].badge,
      )}
    >
      {withIcon && <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />}
      {meta.label}
    </span>
  );
}

export function StatusBadge({
  status,
  size = 'sm',
  withIcon = true,
}: {
  status: OrderStatus | string;
  size?: 'sm' | 'md';
  withIcon?: boolean;
}) {
  return (
    <StatusPill
      meta={ORDER_STATUS[status] ?? UNKNOWN(String(status))}
      size={size}
      withIcon={withIcon}
    />
  );
}

export function PaymentStatusBadge({
  status,
  size = 'sm',
}: {
  status: string;
  size?: 'sm' | 'md';
}) {
  return <StatusPill meta={PAYMENT_STATUS[status] ?? UNKNOWN(String(status))} size={size} />;
}

export function DriverStatusBadge({ status, size = 'sm' }: { status: string; size?: 'sm' | 'md' }) {
  return <StatusPill meta={DRIVER_STATUS[status] ?? UNKNOWN(String(status))} size={size} />;
}

export function Badge({
  children,
  variant = 'default',
}: {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const variants = {
    default: 'bg-muted text-foreground',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold',
        variants[variant],
      )}
    >
      {children}
    </span>
  );
}
