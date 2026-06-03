/**
 * Centralized error → Arabic mapping for the auth surface. All four
 * auth screens (Login, Register, ForgotPassword, OtpVerify) used to format
 * errors inconsistently — some surfaced raw English ("Request failed with
 * status code 409"), others guessed. This file is the single source of truth.
 */
import { TamemApiError } from '@tamem/api-client';

export function authErrorMessage(
  err: unknown,
  context: 'login' | 'register' | 'reset' | 'otp',
): string {
  if (err instanceof TamemApiError) {
    if (err.status === 401) {
      return context === 'login'
        ? 'رقم الهاتف أو كلمة المرور غير صحيحة. تأكد منهما وحاول مرة أخرى.'
        : (err.messageAr ?? 'انتهت صلاحية الجلسة. سجّل دخولك من جديد.');
    }
    if (err.status === 403) return err.messageAr ?? 'الحساب غير مفعّل أو محظور.';
    if (err.status === 404) return err.messageAr ?? 'هذا الرقم غير مسجَّل لدينا.';
    if (err.status === 409) {
      return context === 'register'
        ? 'هذا الرقم مسجَّل بالفعل. جرّب تسجيل الدخول أو نسيت كلمة المرور.'
        : (err.messageAr ?? 'حدث تعارض في البيانات.');
    }
    if (err.status === 422) return err.messageAr ?? 'بيانات غير صحيحة. راجع الحقول.';
    if (err.status === 429) return 'محاولات كتير. انتظر دقيقة وحاول تاني.';
    if (err.status >= 500) return 'خطأ في الخادم. حاول مرة أخرى بعد قليل.';
    return err.messageAr ?? err.message;
  }
  if (err instanceof Error && /network|fetch|ECONN|timeout/i.test(err.message)) {
    return 'تعذّر الاتصال بالخادم. تأكد من اتصالك بالإنترنت ثم حاول مرة أخرى.';
  }
  return err instanceof Error ? err.message : 'حصلت مشكلة. حاول تاني.';
}
