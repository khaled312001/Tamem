import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Logo } from '../components/Logo.js';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuth((s) => s.setSession);
  const [phone, setPhone] = useState('+201010254819');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.login(phone, password);
      setSession(res.user, res.tokens);
      toast.success(`أهلاً ${res.user.name}`);
      navigate('/overview', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل تسجيل الدخول';
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

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold mb-1.5" htmlFor="phone">
              رقم الهاتف
            </label>
            <input
              id="phone"
              type="tel"
              required
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-input focus:border-brand-red focus:ring-2 focus:ring-brand-red/20 outline-none transition"
              placeholder="+201XXXXXXXXX"
            />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1.5" htmlFor="password">
              كلمة المرور
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-input focus:border-brand-red focus:ring-2 focus:ring-brand-red/20 outline-none transition"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-red hover:bg-brand-red/90 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition"
          >
            {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
          </button>
        </form>
      </div>
    </div>
  );
}
