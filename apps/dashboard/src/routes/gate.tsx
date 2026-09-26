import { TamemApiError } from '@tamem/api-client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Logo } from '../components/Logo.js';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';

// ── باب الدخول الخاص بالمالك ────────────────────────────────────────────────
// لينك منفصل تمامًا عن /login: رمز واحد طويل، من غير إيميل ومن غير OTP، وبيفتح
// نفس الداشبورد بنفس الصلاحيات. صفحة الدخول العادية ما اتلمستش — الفريق لسه
// بيدخل منها زي ما هو.
//
// الرمز بيتحط في اللينك نفسه (‎/k/<الرمز>‎) عشان دوسة واحدة تفتح، وأول ما
// يتقبل بنستبدل اللينك من شريط العنوان فورًا (navigate replace) فمايفضلش
// معروض ولا يتسجّل في الـ history. ولو حد فتح ‎/k‎ من غير رمز بيتكتب بالإيد.
function messageFor(err: unknown): string {
  if (err instanceof TamemApiError) {
    if (err.status === 401) return 'رمز الدخول غير صحيح';
    if (err.status === 429) return 'محاولات كثيرة — جرّب بعد ساعة';
    if (err.status === 404) return 'الدخول بالرمز غير مفعّل على الخادم';
    return err.messageAr ?? err.message;
  }
  if (err instanceof Error && /network|fetch|ECONN|timeout/i.test(err.message)) {
    return 'تعذّر الاتصال بالخادم — راجع اتصالك بالإنترنت';
  }
  return 'فشل الدخول';
}

export function GatePage() {
  const navigate = useNavigate();
  const { code: codeFromUrl } = useParams<{ code?: string }>();
  const setSession = useAuth((s) => s.setSession);

  const [passcode, setPasscode] = useState(codeFromUrl ?? '');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // A code in the URL must be tried exactly once: without this, the failed
  // attempt re-renders and fires again, burning the 10-tries-an-hour budget.
  const tried = useRef(false);

  const submit = async (value: string) => {
    const clean = value.trim();
    if (!clean || loading) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = (await api.raw.post('/auth/admin/passcode', { passcode: clean })) as {
        data?: { data?: { user: unknown; tokens: unknown } };
      };
      const payload = res.data?.data;
      if (!payload?.user || !payload?.tokens) throw new Error('استجابة غير متوقعة من الخادم');
      setSession(
        payload.user as Parameters<ReturnType<typeof useAuth.getState>['setSession']>[0],
        payload.tokens as Parameters<ReturnType<typeof useAuth.getState>['setSession']>[1],
      );
      toast.success('تم تسجيل الدخول');
      navigate('/overview', { replace: true });
    } catch (err: unknown) {
      const msg = messageFor(err);
      setErrorMsg(msg);
      toast.error(msg);
      // A wrong code must not stay in the address bar, where the next person to
      // open the link would send it again.
      if (codeFromUrl) navigate('/k', { replace: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (codeFromUrl && !tried.current) {
      tried.current = true;
      void submit(codeFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeFromUrl]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(passcode);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-red to-brand-dark p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <Logo className="mx-auto h-28 w-auto mb-2" />
          <h1 className="text-2xl font-black text-brand-dark">دخول بالرمز</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {codeFromUrl && loading ? 'جارٍ الدخول…' : 'اكتب رمز الدخول الخاص بك'}
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-bold px-3 py-2 text-center">
            {errorMsg}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            autoFocus={!codeFromUrl}
            autoComplete="off"
            dir="ltr"
            placeholder="رمز الدخول"
            className="w-full rounded-lg border border-border px-3 py-2.5 text-center tracking-wider font-mono focus:outline-none focus:ring-2 focus:ring-brand-red/40"
          />
          <button
            type="submit"
            disabled={loading || !passcode.trim()}
            className="w-full rounded-lg bg-brand-red text-white font-black py-2.5 disabled:opacity-50"
          >
            {loading ? 'جارٍ الدخول…' : 'دخول'}
          </button>
        </form>
      </div>
    </div>
  );
}
