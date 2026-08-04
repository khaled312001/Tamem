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

export function MerchantLoginPage() {
  const navigate = useNavigate();
  const setSession = useAuth((s) => s.setSession);

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.merchantLogin(phone, password);
      // Store merchant profile in sessionStorage for the panel to read
      sessionStorage.setItem('tamem-merchant-profile', JSON.stringify(res.merchantProfile));
      setSession(
        res.user as Parameters<ReturnType<typeof useAuth.getState>['setSession']>[0],
        res.tokens as Parameters<ReturnType<typeof useAuth.getState>['setSession']>[1],
      );
      toast.success(
        `أهلاً ${(res.merchantProfile as { storeNameAr?: string })?.storeNameAr ?? res.user.name}`,
      );
      navigate('/merchant', { replace: true });
    } catch (err: unknown) {
      const msg = loginErrorMessage(err);
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-red via-brand-dark to-black p-4 relative">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md border border-border">
        <div className="text-center mb-8">
          <Logo className="mx-auto h-24 w-auto mb-3" />
          <h1 className="text-2xl font-black text-brand-dark">لوحة تحكم التاجر</h1>
          <p className="text-sm text-muted-foreground mt-1">سجّل دخولك لإدارة منتجاتك وأقسامك</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label
              className="block text-sm font-bold mb-1.5 text-foreground"
              htmlFor="merchant-phone"
            >
              رقم الهاتف
            </label>
            <input
              id="merchant-phone"
              type="text"
              autoComplete="tel"
              required
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01200000001"
              className="w-full px-4 py-3 rounded-lg border border-input focus:border-brand-red focus:ring-2 focus:ring-brand-red/20 outline-none transition text-sm"
            />
          </div>
          <div>
            <label
              className="block text-sm font-bold mb-1.5 text-foreground"
              htmlFor="merchant-password"
            >
              كلمة المرور
            </label>
            <input
              id="merchant-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-input focus:border-brand-red focus:ring-2 focus:ring-brand-red/20 outline-none transition text-sm"
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
            className="w-full bg-brand-red hover:bg-brand-red/90 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition duration-200 shadow-md hover:shadow-lg text-sm"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2 justify-center">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                جاري التحقق...
              </span>
            ) : (
              'تسجيل الدخول'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
