import { TamemApiError } from '@tamem/api-client';
import { useMutation } from '@tanstack/react-query';
import { Copy, KeyRound, Loader2, Shuffle } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { api } from '../lib/api.js';
import { Button } from './ui/Button.js';
import { Dialog } from './ui/Dialog.js';
import { Input } from './ui/Input.js';

export interface PasswordTarget {
  id: string;
  name?: string | null;
  phone?: string | null;
}

/** Readable on the phone: no 0/O/1/l/I to mishear, and a digit guaranteed. */
function suggest(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const pick = (set: string, n: number) =>
    Array.from(crypto.getRandomValues(new Uint32Array(n)))
      .map((v) => set[v % set.length])
      .join('');
  return `Tamem${pick(letters, 4)}${pick(digits, 3)}`;
}

function errorText(err: unknown): string {
  if (err instanceof TamemApiError) return err.messageAr ?? err.message;
  return err instanceof Error ? err.message : 'تعذّر تغيير كلمة المرور';
}

/**
 * Sets a password on someone's behalf.
 *
 * The app's «نسيت كلمة المرور» now tells customers to ask the office, so the
 * office needs this to exist — otherwise that message sends them nowhere. The
 * admin reads the new password out, which is why one can be generated here and
 * copied: a password invented on the spot tends to be a weak one, and a
 * password nobody can dictate over the phone gets written down.
 */
export function SetPasswordDialog({
  target,
  onClose,
}: {
  target: PasswordTarget | null;
  onClose: () => void;
}) {
  const [password, setPassword] = useState('');

  useEffect(() => {
    setPassword('');
  }, [target?.id]);

  const mut = useMutation({
    mutationFn: (pw: string) =>
      api.raw.post(`/admin/users/${target?.id}/password`, { password: pw }),
    onSuccess: () => {
      toast.success('تم تغيير كلمة المرور');
      onClose();
    },
    onError: (err: unknown) => toast.error(errorText(err)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password.trim().length < 8) {
      toast.error('كلمة المرور لازم تكون 8 أحرف على الأقل');
      return;
    }
    mut.mutate(password.trim());
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      toast.success('تم نسخ كلمة المرور');
    } catch {
      toast.error('تعذّر النسخ — انسخها يدويًا');
    }
  };

  return (
    <Dialog
      open={!!target}
      onOpenChange={(o) => !o && onClose()}
      title="تغيير كلمة المرور"
      description={target ? `${target.name ?? 'المستخدم'} — ${target.phone ?? ''}` : undefined}
      size="sm"
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-bold mb-1.5" htmlFor="new-password">
            كلمة المرور الجديدة
          </label>
          <div className="flex gap-2">
            <Input
              id="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8 أحرف على الأقل"
              dir="ltr"
              autoComplete="off"
              className="font-mono"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setPassword(suggest())}
              title="اقترح كلمة مرور"
            >
              <Shuffle className="w-4 h-4" />
            </Button>
            <Button type="button" variant="outline" onClick={copy} disabled={!password} title="نسخ">
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            بلّغ العميل بكلمة المرور الجديدة. أي كود استعادة قديم بيتلغي فورًا.
          </p>
        </div>

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" disabled={mut.isPending}>
            {mut.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <KeyRound className="w-4 h-4" />
            )}
            حفظ
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
