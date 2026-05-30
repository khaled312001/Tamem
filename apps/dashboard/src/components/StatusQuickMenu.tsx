import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { ORDER_STATUS_AR, ORDER_TRANSITIONS, type OrderStatus } from '@tamem/types';

import { api } from '../lib/api.js';

import { StatusBadge } from './ui/Badge.js';

interface StatusQuickMenuProps {
  orderId: string;
  status: OrderStatus;
  size?: 'sm' | 'md';
  /** When false, renders as a plain badge (no dropdown). */
  editable?: boolean;
  /** Optional callback fired after a successful status change. */
  onChanged?: (next: OrderStatus) => void;
}

/**
 * Clickable status badge. Tap it → menu of allowed next statuses.
 * - One-click for normal transitions.
 * - CANCELLED/REJECTED open a reason input inline (admin must justify).
 *
 * Eliminates the multi-step "open drawer → scroll → click arrow → confirm"
 * dance the admin used to do for every status update.
 */
export function StatusQuickMenu({
  orderId,
  status,
  size = 'sm',
  editable = true,
  onChanged,
}: StatusQuickMenuProps) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [needsReasonFor, setNeedsReasonFor] = useState<OrderStatus | null>(null);
  const [reason, setReason] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  const allowed = (ORDER_TRANSITIONS[status] ?? []) as readonly OrderStatus[];

  const updateMut = useMutation({
    mutationFn: ({ next, why }: { next: OrderStatus; why?: string }) =>
      api.adminUpdateOrderStatus(orderId, next, why),
    onSuccess: (_data, vars) => {
      toast.success(`تم: ${ORDER_STATUS_AR[vars.next]}`);
      qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
      qc.invalidateQueries({ queryKey: ['admin', 'order', orderId] });
      setOpen(false);
      setNeedsReasonFor(null);
      setReason('');
      onChanged?.(vars.next);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setNeedsReasonFor(null);
        setReason('');
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const onPick = (next: OrderStatus) => {
    if (next === 'CANCELLED' || next === 'REJECTED') {
      setNeedsReasonFor(next);
      return;
    }
    updateMut.mutate({ next });
  };

  if (!editable || allowed.length === 0) {
    return <StatusBadge status={status} size={size} />;
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        disabled={updateMut.isPending}
        className="inline-flex items-center gap-1 hover:opacity-80 transition cursor-pointer disabled:opacity-50"
      >
        <StatusBadge status={status} size={size} />
        {updateMut.isPending ? (
          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
        ) : (
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div
          className="absolute z-50 top-full mt-1 end-0 min-w-[200px] bg-white border border-border rounded-lg shadow-lg py-1"
          onClick={(e) => e.stopPropagation()}
        >
          {needsReasonFor ? (
            <div className="p-2 w-64">
              <div className="text-xs font-bold mb-1 text-muted-foreground">
                سبب {ORDER_STATUS_AR[needsReasonFor]}
              </div>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="اكتب السبب..."
                autoFocus
                className="w-full px-2 py-1.5 rounded border border-input bg-white text-xs"
              />
              <div className="flex justify-end gap-1 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setNeedsReasonFor(null);
                    setReason('');
                  }}
                  className="px-2 py-1 text-xs text-muted-foreground hover:bg-muted rounded"
                >
                  تراجع
                </button>
                <button
                  type="button"
                  disabled={reason.trim().length < 2 || updateMut.isPending}
                  onClick={() => updateMut.mutate({ next: needsReasonFor, why: reason.trim() })}
                  className="px-2 py-1 text-xs bg-brand-red text-white font-bold rounded disabled:opacity-50"
                >
                  {updateMut.isPending && <Loader2 className="w-3 h-3 animate-spin inline" />}
                  تأكيد
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="px-3 py-1.5 text-xs font-bold text-muted-foreground border-b border-border">
                نقل إلى:
              </div>
              {allowed.map((next) => {
                const isDanger = next === 'CANCELLED' || next === 'REJECTED';
                return (
                  <button
                    key={next}
                    type="button"
                    onClick={() => onPick(next)}
                    disabled={updateMut.isPending}
                    className={`w-full text-right px-3 py-2 text-sm hover:bg-muted/50 transition flex items-center justify-between gap-2 ${
                      isDanger ? 'text-red-600 hover:bg-red-50' : ''
                    }`}
                  >
                    <span className="font-bold">{ORDER_STATUS_AR[next]}</span>
                    {isDanger && <X className="w-3.5 h-3.5" />}
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
