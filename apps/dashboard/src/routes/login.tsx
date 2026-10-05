import { TamemApiError } from '@tamem/api-client';
import { useState, type FormEvent } from 'react';
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

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuth((s) => s.setSession);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const submitCredentials = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      // Password only — the server stopped issuing a second factor, and the
      // code that waited for one is gone. /auth/admin/otp/verify is still
      // routable for builds older than this one; nothing here calls it.
      const res = (await api.login(identifier, password)) as unknown as {
        user?: Parameters<ReturnType<typeof useAuth.getState>['setSession']>[0];
        tokens?: Parameters<ReturnType<typeof useAuth.getState>['setSession']>[1];
      };
      if (!res.user || !res.tokens) throw new Error('استجابة غير متوقعة من الخادم');
      setSession(res.user, res.tokens);
      toast.success(`أهلاً ${res.user.name}`);
      navigate('/overview', { replace: true });
    } catch (err: unknown) {
      const msg = loginErrorMessage(err);
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-red to-brand-dark p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <Logo className="mx-auto h-28 w-auto mb-2" />
          <h1 className="text-2xl font-black text-brand-dark">لوحة التحكم</h1>
          <p className="text-sm text-muted-foreground mt-1">سجّل دخولك للمتابعة</p>
        </div>

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
      </div>
    </div>
  );
}
