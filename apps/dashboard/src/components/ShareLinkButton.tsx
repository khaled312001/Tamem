import { Link2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Copies the public link of a store (s), product (p) or offer (o):
 * deliverytamem.com/<kind>/<id>. Someone with the app installed lands on that
 * page in the app; without it they get a preview card and the install button.
 */
export type ShareKind = 's' | 'p' | 'o';

export const SHARE_BASE = 'https://deliverytamem.com';

export function shareLink(kind: ShareKind, id: string): string {
  return `${SHARE_BASE}/${kind}/${encodeURIComponent(id)}`;
}

export async function copyShareLink(kind: ShareKind, id: string): Promise<void> {
  const url = shareLink(kind, id);
  try {
    await navigator.clipboard.writeText(url);
    toast.success('اتنسخ الرابط. اللي عنده التطبيق هيفتح على الصفحة دي على طول');
  } catch {
    window.prompt('انسخ الرابط', url);
  }
}

const LABEL: Record<ShareKind, string> = {
  s: 'نسخ رابط المحل',
  p: 'نسخ رابط المنتج',
  o: 'نسخ رابط العرض',
};

export function ShareLinkButton({
  kind,
  id,
  className,
}: {
  kind: ShareKind;
  id: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => void copyShareLink(kind, id)}
      aria-label={LABEL[kind]}
      title={LABEL[kind]}
      className={
        className ?? 'p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground'
      }
    >
      <Link2 className="w-4 h-4" />
    </button>
  );
}
