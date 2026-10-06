import { TamemApiError } from '@tamem/api-client';
import { useMutation } from '@tanstack/react-query';
import { Copy, ExternalLink, KeyRound, Link2, Loader2, MessageCircle, Shuffle } from 'lucide-react';
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

interface ResetLink {
  url: string;
  message: string;
  whatsappUrl: string;
  expiresInHours: number;
}

/**
 * Two ways to rescue a customer who forgot their password, because the app's
 * «نسيت كلمة المرور» sends them to the office and the office needs an answer.
 *
 * 1. Send a link (preferred). One-time, 48 hours, and the customer picks their
 *    own password — so nothing has to be dictated over the phone and the
 *    office never learns it.
 * 2. Set one directly, for a customer who cannot open a link at all. It can be
 *    generated here and copied, because a password invented on the spot tends
 *    to be weak and one nobody can read out loud gets written down.
 */
export function SetPasswordDialog({
  target,
  onClose,
}: {
  target: PasswordTarget | null;
  onClose: () => void;
}) {
  const [password, setPassword] = useState('');
  const [link, setLink] = useState<ResetLink | null>(null);

  useEffect(() => {
    setPassword('');
    setLink(null);
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

  const linkMut = useMutation({
    mutationFn: () =>
      api.raw
        .post(`/admin/users/${target?.id}/reset-link`, {})
        .then((r) => r.data.data as ResetLink),
    onSuccess: setLink,
    onError: (err: unknown) => toast.error(errorText(err)),
  });

  const copyText = async (text: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(ok);
    } catch {
      toast.error('تعذّر النسخ — انسخه يدويًا');
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
      <div className="space-y-4">
        <section className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
          <div>
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Link2 className="w-4 h-4 text-brand-red" />
              رابط يغيّرها بنفسه
            </h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              ابعتله الرابط على واتساب ويختار كلمة المرور بنفسه. صالح 48 ساعة ومرة واحدة بس، ومش
              هتعرف كلمة المرور — وده الأحسن.
            </p>
          </div>

          {!link ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => linkMut.mutate()}
              disabled={linkMut.isPending}
            >
              {linkMut.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Link2 className="w-4 h-4" />
              )}
              <span className="ms-2">اعمل رابط</span>
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input readOnly value={link.url} dir="ltr" className="font-mono text-xs" />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void copyText(link.url, 'تم نسخ الرابط')}
                  title="نسخ الرابط"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex gap-2">
                {link.whatsappUrl ? (
                  <a
                    href={link.whatsappUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#25D366] text-white text-sm font-bold"
                  >
                    <MessageCircle className="w-4 h-4" />
                    ابعته على واتساب
                  </a>
                ) : (
                  // Google sign-ups have a g_… placeholder instead of a number.
                  <p className="flex-1 text-xs text-muted-foreground self-center">
                    مفيش رقم واتساب للحساب ده — انسخ الرابط وابعته بأي طريقة.
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void copyText(link.message, 'تم نسخ الرسالة')}
                  title="نسخ الرسالة كاملة"
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                لو عملت رابط جديد، القديم بيتلغي على طول.
              </p>
            </div>
          )}
        </section>

        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">أو حدّدها بنفسك</span>
          <span className="h-px flex-1 bg-border" />
        </div>

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
              <Button
                type="button"
                variant="outline"
                onClick={() => void copyText(password, 'تم نسخ كلمة المرور')}
                disabled={!password}
                title="نسخ"
              >
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
      </div>
    </Dialog>
  );
}
