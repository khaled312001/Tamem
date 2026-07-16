import { AlertTriangle, Loader2 } from 'lucide-react';

import { Button } from './Button.js';
import { Dialog } from './Dialog.js';

/**
 * One RTL confirmation dialog for every destructive action. Replaces the 13
 * scattered `window.confirm()` calls (LTR English) and the "no confirmation at
 * all" cases the audit found.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel = 'حذف',
  cancelLabel = 'إلغاء',
  tone = 'danger',
  loading = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="sm">
      <div className="flex flex-col items-center text-center gap-3 pt-1">
        <span
          className={
            tone === 'danger'
              ? 'grid place-items-center w-12 h-12 rounded-full bg-red-100 text-red-600'
              : 'grid place-items-center w-12 h-12 rounded-full bg-brand-red/10 text-brand-red'
          }
        >
          <AlertTriangle className="w-6 h-6" />
        </span>
        <h3 className="text-lg font-black text-brand-dark">{title}</h3>
        {message && <p className="text-sm text-muted-foreground max-w-sm">{message}</p>}
      </div>
      <div className="mt-5 flex gap-2">
        <Button
          variant="outline"
          size="md"
          className="flex-1"
          onClick={() => onOpenChange(false)}
          disabled={loading}
        >
          {cancelLabel}
        </Button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={
            tone === 'danger'
              ? 'flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700 disabled:opacity-60 transition'
              : 'flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-brand-red text-white font-bold hover:bg-brand-red/90 disabled:opacity-60 transition'
          }
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
