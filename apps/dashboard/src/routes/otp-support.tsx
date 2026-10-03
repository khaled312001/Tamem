import { useQuery } from '@tanstack/react-query';
import { Copy, KeyRound, Loader2, MessageCircle, RefreshCw, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button.js';
import { Input } from '../components/ui/Input.js';
import { api } from '../lib/api.js';

type LookupResult = {
  phone: string;
  found: boolean;
  code?: string | null;
  codeMissing?: boolean;
  consumed?: boolean;
  expired?: boolean;
  active?: boolean;
  attempts?: number;
  expiresAt?: string;
  createdAt?: string;
};

/**
 * Support fallback for when WhatsApp fails to deliver a login code: an admin
 * types the customer's phone and reads the active code to them over the phone.
 * The code is short-lived (5 min) and single-use — the same one WhatsApp sends.
 */
export function OtpSupportPage() {
  const [phoneInput, setPhoneInput] = useState('');
  const [submitted, setSubmitted] = useState('');

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'otp-lookup', submitted],
    queryFn: () =>
      api.raw
        .get('/admin/otp-lookup', { params: { phone: submitted } })
        .then((r) => r.data.data as LookupResult),
    enabled: submitted !== '',
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = phoneInput.trim();
    if (!v) return;
    if (v === submitted) void refetch();
    else setSubmitted(v);
  };

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="rounded-xl border border-border bg-white p-4">
        <div className="flex items-center gap-2 text-lg font-black">
          <KeyRound className="h-5 w-5 text-brand-red" /> أكواد الدخول — دعم العملاء
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          لو العميل مجاش له كود الدخول على واتساب، اكتب رقمه هنا وقوله الكود في التليفون. الكود صالح
          ٥ دقائق ويُستخدم مرة واحدة.
        </p>
        <form onSubmit={submit} className="mt-3 flex gap-2">
          <Input
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            placeholder="رقم العميل (مثال: 01070750167)"
            dir="ltr"
            inputMode="tel"
            className="flex-1"
          />
          <Button type="submit" disabled={isFetching || !phoneInput.trim()}>
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            بحث
          </Button>
        </form>
      </div>

      {submitted !== '' && isFetching && !data && (
        <div className="rounded-xl border border-border bg-white p-6 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> جاري البحث…
        </div>
      )}

      {submitted !== '' && data && !isFetching && (
        <ResultCard data={data} onRefresh={() => void refetch()} />
      )}
    </div>
  );
}

function ResultCard({ data, onRefresh }: { data: LookupResult; onRefresh: () => void }) {
  if (!data.found) {
    return (
      <Notice tone="muted">
        مفيش أي كود للرقم <b dir="ltr">{data.phone}</b>. اطلب من العميل يفتح التطبيق ويضغط «إرسال
        كود» الأول، وبعدها ابحث تاني.
      </Notice>
    );
  }
  if (data.codeMissing) {
    return (
      <Notice tone="warn">
        آخر كود للرقم ده قديم (اتعمل قبل الميزة دي). اطلب من العميل يطلب كود جديد من التطبيق.
      </Notice>
    );
  }
  if (data.consumed) {
    return (
      <Notice tone="warn">
        الكود بتاع الرقم ده <b>اتستخدم خلاص</b> — غالبًا العميل دخل. لو لسه مش داخل، خلّيه يطلب كود
        جديد.
        <RefreshButton onRefresh={onRefresh} />
      </Notice>
    );
  }
  if (data.expired) {
    return (
      <Notice tone="warn">
        الكود <b>انتهت صلاحيته</b>. اطلب من العميل يطلب كود جديد من التطبيق.
        <RefreshButton onRefresh={onRefresh} />
      </Notice>
    );
  }
  // Active, usable code.
  return <ActiveCode data={data} onRefresh={onRefresh} />;
}

function ActiveCode({ data, onRefresh }: { data: LookupResult; onRefresh: () => void }) {
  const [remaining, setRemaining] = useState(() => secondsLeft(data.expiresAt));
  useEffect(() => {
    setRemaining(secondsLeft(data.expiresAt));
    const t = setInterval(() => setRemaining(secondsLeft(data.expiresAt)), 1000);
    return () => clearInterval(t);
  }, [data.expiresAt]);

  const code = data.code ?? '';
  const message = buildCustomerMessage(code);
  const waDigits = data.phone.replace(/\D+/g, '');
  const waUrl =
    waDigits.length >= 11 ? `https://wa.me/${waDigits}?text=${encodeURIComponent(message)}` : null;

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error('تعذّر النسخ');
    }
  };

  const expiredNow = remaining <= 0;

  return (
    <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 text-center">
      <div className="text-xs font-bold text-emerald-800">
        كود الدخول للرقم <span dir="ltr">{data.phone}</span>
      </div>
      <div
        dir="ltr"
        className="select-all font-mono text-5xl font-black tracking-[0.3em] text-emerald-900"
      >
        {code}
      </div>
      {expiredNow ? (
        <div className="text-sm font-bold text-destructive">انتهت الصلاحية — اطلب كود جديد</div>
      ) : (
        <div className="text-sm text-emerald-800">
          صالح · باقي <b>{formatCountdown(remaining)}</b>
        </div>
      )}
      <div className="flex flex-wrap justify-center gap-2 pt-1">
        <Button
          size="sm"
          onClick={() => copyText(message, 'تم نسخ الرسالة — ابعتها للعميل')}
          disabled={expiredNow}
        >
          <Copy className="h-3.5 w-3.5" /> نسخ الرسالة
        </Button>
        {waUrl && !expiredNow && (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#25D366] px-3 py-1.5 text-sm font-bold text-white transition hover:brightness-95"
          >
            <MessageCircle className="h-3.5 w-3.5" /> واتساب العميل
          </a>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => copyText(code, 'تم نسخ الكود')}
          disabled={expiredNow}
        >
          <Copy className="h-3.5 w-3.5" /> نسخ الكود
        </Button>
        <Button size="sm" variant="outline" onClick={onRefresh}>
          <RefreshCw className="h-3.5 w-3.5" /> تحديث
        </Button>
      </div>
      {!expiredNow && (
        <details className="text-start">
          <summary className="cursor-pointer text-[11px] font-bold text-emerald-800/80">
            معاينة الرسالة
          </summary>
          <pre className="mt-1 whitespace-pre-wrap rounded-md border border-emerald-200 bg-white p-2 text-start font-sans text-xs leading-5 text-foreground">
            {message}
          </pre>
        </details>
      )}
      {(data.attempts ?? 0) > 0 && (
        <div className="text-[11px] text-muted-foreground">
          محاولات إدخال خاطئة: {data.attempts} (بعد ٥ محاولات يتقفل الكود)
        </div>
      )}
    </div>
  );
}

function RefreshButton({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="mt-2">
      <Button size="sm" variant="outline" onClick={onRefresh}>
        <RefreshCw className="h-3.5 w-3.5" /> تحديث
      </Button>
    </div>
  );
}

function Notice({ tone, children }: { tone: 'muted' | 'warn'; children: React.ReactNode }) {
  const cls =
    tone === 'warn'
      ? 'border-amber-200 bg-amber-50 text-amber-900'
      : 'border-border bg-muted/30 text-muted-foreground';
  return <div className={`rounded-xl border p-5 text-center text-sm ${cls}`}>{children}</div>;
}

/** The ready-to-send customer WhatsApp message carrying their login code. */
function buildCustomerMessage(code: string): string {
  return [
    'تميم للتوصيل 🚚',
    '',
    'أهلاً بيك 👋',
    'كود الدخول الخاص بحسابك هو:',
    '',
    `🔐 ${code}`,
    '',
    'صالح لمدة ٥ دقائق، ويُستخدم مرة واحدة.',
    'دخّله في التطبيق عشان تكمّل تسجيل الدخول.',
    '',
    '⚠️ الكود ده خاص بيك لوحدك — متشاركهوش مع أي حد.',
  ].join('\n');
}

function secondsLeft(iso?: string): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
}

function formatCountdown(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
