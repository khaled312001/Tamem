import { RefreshCw, WifiOff } from 'lucide-react';

import { Button } from './Button.js';

/**
 * Standard error state. The audit found 22/26 list routes rendered a failed
 * fetch as if it were "no data". Every list should branch:
 * loading → error → empty → data. This is the error branch.
 */
export function ErrorState({
  message = 'تعذّر تحميل البيانات. تأكد من الاتصال وحاول مرة أخرى.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="grid place-items-center w-14 h-14 rounded-full bg-red-50 text-red-500 mb-3">
        <WifiOff className="w-7 h-7" />
      </div>
      <h3 className="text-lg font-bold text-foreground">حدث خطأ</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-md">{message}</p>
      {onRetry && (
        <Button variant="outline" size="md" className="mt-4" onClick={onRetry}>
          <RefreshCw className="w-4 h-4" />
          إعادة المحاولة
        </Button>
      )}
    </div>
  );
}
