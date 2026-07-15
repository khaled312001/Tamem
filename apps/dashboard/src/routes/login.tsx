import { TamemApiError } from '@tamem/api-client';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Logo } from '../components/Logo.js';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';

function loginErrorMessage(err: unknown): string {
  if (err instanceof TamemApiError) {
    if (err.status === 401) return err.messageAr ?? 'بيانات الدخول غير صحيحة';
    if (err.status === 422) return err.messageAr ?? 'بيانات الدخول غير صحيحة';
    if (err.status === 403) return err.messageAr ?? 'الحساب غير مفعّل';
    if (err.status >= 500) return 'خطأ في الخادم، حاول بعد قليل';
    return err.messageAr ?? err.message;
  }
  if (err instanceof Error && /network|fetch|ECONN|timeout/i.test(err.message)) {
    return 'تعذّر الاتصال بالخادم — راجع اتصالك بالإنترنت';
  }
  return err instanceof Error ? err.message : 'فشل تسجيل الدخول';
}

interface OtpState {
  pendingToken: string;
  expiresAt: number; // unix ms
  recipients: number;
}

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuth((s) => s.setSession);

  // Step 1: credentials
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  // Step 2: OTP (only shown for admin accounts)
  const [otp, setOtp] = useState<OtpState | null>(null);
  const [code, setCode] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Tick every second so the countdown ("صالح لـ 04:32") updates without
  // re-rendering the whole page on every state change elsewhere.
  useEffect(() => {
    if (!otp) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [otp]);

  // If the code expires while the user is staring at the screen, drop back
  // to step 1 with a helpful hint.
  useEffect(() => {
    if (otp && otp.expiresAt <= now) {
      setOtp(null);
      setCode('');
      setErrorMsg('انتهت صلاحية الرمز، اطلب رمز جديد بإعادة تسجيل الدخول');
    }
  }, [otp, now]);

  const submitCredentials = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = (await api.login(identifier, password)) as unknown as {
        requiresOtp?: boolean;
        pendingToken?: string;
        expiresInSec?: number;
        otpRecipientsCount?: number;
        user?: Parameters<ReturnType<typeof useAuth.getState>['setSession']>[0];
        tokens?: Parameters<ReturnType<typeof useAuth.getState>['setSession']>[1];
      };
      if (res.requiresOtp && res.pendingToken) {
        setOtp({
          pendingToken: res.pendingToken,
          expiresAt: Date.now() + (res.expiresInSec ?? 300) * 1000,
          recipients: res.otpRecipientsCount ?? 2,
        });
        toast.success('تم إرسال رمز التحقق للبريد');
      } else if (res.user && res.tokens) {
        setSession(res.user, res.tokens);
        toast.success(`أهلاً ${res.user.name}`);
        navigate('/overview', { replace: true });
      } else {
        throw new Error('استجابة غير متوقعة من الخادم');
      }
    } catch (err: unknown) {
      const msg = loginErrorMessage(err);
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (!otp) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = (await api.raw.post('/auth/admin/otp/verify', {
        pendingToken: otp.pendingToken,
        code: code.trim(),
      })) as { data?: { data?: { user: unknown; tokens: unknown } } };
      const payload = res.data?.data;
      if (!payload || !payload.user || !payload.tokens) {
        throw new Error('استجابة غير متوقعة من الخادم');
      }
      setSession(
        payload.user as Parameters<ReturnType<typeof useAuth.getState>['setSession']>[0],
        payload.tokens as Parameters<ReturnType<typeof useAuth.getState>['setSession']>[1],
      );
      toast.success('تم تسجيل الدخول');
      navigate('/overview', { replace: true });
    } catch (err: unknown) {
      const msg = loginErrorMessage(err);
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const remainingSec = otp ? Math.max(0, Math.floor((otp.expiresAt - now) / 1000)) : 0;
  const mm = String(Math.floor(remainingSec / 60)).padStart(2, '0');
  const ss = String(remainingSec % 60).padStart(2, '0');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-red to-brand-dark p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <Logo className="mx-auto h-28 w-auto mb-2" />
          <h1 className="text-2xl font-black text-brand-dark">لوحة التحكم</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {otp ? 'أدخل رمز التحقق المرسل للبريد' : 'سجّل دخولك للمتابعة'}
          </p>
        </div>

        {!otp && (
          <form onSubmit={submitCredentials} className="space-y-4">
            <div>
              <label className="block text-sm font-bold mb-1.5" htmlFor="identifier">
                البريد الإلكتروني أو رقم الهاتف
              </label>
              <input
                id="identifier"
                type="text"
                autoComplete="off"
                required
                dir="ltr"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-input focus:border-brand-red focus:ring-2 focus:ring-brand-red/20 outline-none transition"
              />
            </div>
            <div>
              <label className="block text-sm font-bold mb-1.5" htmlFor="password">
                كلمة المرور
              </label>
              <input
                id="password"
                type="password"
                autoComplete="off"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-input focus:border-brand-red focus:ring-2 focus:ring-brand-red/20 outline-none transition"
              />
            </div>
            {errorMsg && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2"
              >
                {errorMsg}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-red hover:bg-brand-red/90 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition"
            >
              {loading ? 'جاري التحقق...' : 'تسجيل الدخول'}
            </button>
          </form>
        )}

        {otp && (
          <form onSubmit={submitOtp} className="space-y-4">
            <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2.5 text-center leading-relaxed">
              تم إرسال رمز مكوّن من 6 أرقام على بريد الأدمن الإلكتروني.
              <br />
              صالح لمدة{' '}
              <span className="font-mono font-bold" dir="ltr">
                {mm}:{ss}
              </span>
            </div>
            <div>
              <label className="block text-sm font-bold mb-1.5" htmlFor="code">
                رمز التحقق
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                autoComplete="one-time-code"
                maxLength={6}
                required
                dir="ltr"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="w-full px-4 py-3 rounded-lg border border-input focus:border-brand-red focus:ring-2 focus:ring-brand-red/20 outline-none transition font-mono text-2xl tracking-[0.5em] text-center"
                placeholder="000000"
              />
            </div>
            {errorMsg && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2"
              >
                {errorMsg}
              </div>
            )}
            <button
              type="submit"
              disabled={loading || code.length < 4}
              className="w-full bg-brand-red hover:bg-brand-red/90 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition"
            >
              {loading ? 'جاري التحقق...' : 'تأكيد الرمز'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOtp(null);
                setCode('');
                setErrorMsg(null);
              }}
              className="w-full text-sm text-muted-foreground hover:text-brand-red transition"
            >
              ← رجوع لإعادة إدخال البيانات
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
