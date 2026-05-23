import type { OrderStatus } from '@tamem/types';

import { cn } from '../../lib/utils.js';

// Status colors from docs/BRAND.md
const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  NEW: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'جديد' },
  UNDER_REVIEW: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'قيد المراجعة' },
  PRICED: { bg: 'bg-sky-100', text: 'text-sky-700', label: 'تم التسعير' },
  AWAITING_CUSTOMER_APPROVAL: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-700',
    label: 'بانتظار العميل',
  },
  ACCEPTED: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'مقبول' },
  DRIVER_ASSIGNED: { bg: 'bg-cyan-100', text: 'text-cyan-700', label: 'تم تعيين سائق' },
  PICKED_UP: { bg: 'bg-teal-100', text: 'text-teal-700', label: 'تم الاستلام' },
  IN_ROUTE: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'في الطريق' },
  DELIVERED: { bg: 'bg-green-100', text: 'text-green-700', label: 'تم التسليم' },
  COMPLETED: { bg: 'bg-green-200', text: 'text-green-800', label: 'مكتمل' },
  CANCELLED: { bg: 'bg-zinc-200', text: 'text-zinc-700', label: 'ملغي' },
  REJECTED: { bg: 'bg-red-100', text: 'text-red-700', label: 'مرفوض' },
};

export function StatusBadge({
  status,
  size = 'sm',
}: {
  status: OrderStatus | string;
  size?: 'sm' | 'md';
}) {
  const style = STATUS_STYLES[status] ?? {
    bg: 'bg-zinc-100',
    text: 'text-zinc-700',
    label: status,
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-bold',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        style.bg,
        style.text,
      )}
    >
      {style.label}
    </span>
  );
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

export function DriverStatusBadge({ status }: { status: string }) {
  const styles = {
    AVAILABLE: { bg: 'bg-green-100', text: 'text-green-700', label: 'متاح' },
    BUSY: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'مشغول' },
    OFFLINE: { bg: 'bg-zinc-100', text: 'text-zinc-600', label: 'غير متصل' },
  } as const;
  const s = styles[status as keyof typeof styles] ?? styles.OFFLINE;
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold',
        s.bg,
        s.text,
      )}
    >
      {s.label}
    </span>
  );
}
