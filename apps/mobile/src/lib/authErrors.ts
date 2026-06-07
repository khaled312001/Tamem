/**
 * Centralized error → Arabic mapping for the auth surface. All four
 * auth screens (Login, Register, ForgotPassword, OtpVerify) used to format
 * errors inconsistently — some surfaced raw English ("Request failed with
 * status code 409"), others guessed. This file is the single source of truth.
 *
 * Handles BOTH error shapes:
 *   1. TamemApiError — thrown by the typed `@tamem/api-client` methods.
 *   2. AxiosError    — thrown by `api.raw.post(...)` direct calls (used by
 *      RegisterScreen, ForgotPasswordScreen, OtpVerifyScreen for endpoints
 *      not yet wrapped). Without this fallback, the user would see the
 *      raw `Request failed with status code 409` string from axios.
 */
import { TamemApiError } from '@tamem/api-client';

interface NormalizedError {
  status: number;
  messageAr?: string;
  fallback: string;
}

function normalize(err: unknown): NormalizedError | null {
  if (err instanceof TamemApiError) {
    return { status: err.status, messageAr: err.messageAr, fallback: err.message };
  }
  // Axios-shaped error: { response: { status, data: { error: { messageAr } } } }
  if (typeof err === 'object' && err !== null && 'isAxiosError' in err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const axiosErr = err as { response?: { status?: number; data?: any }; message?: string };
    const status = axiosErr.response?.status ?? 0;
    const data = axiosErr.response?.data;
    const messageAr =
      data?.error?.messageAr ?? data?.error?.message ?? data?.messageAr ?? undefined;
    return { status, messageAr, fallback: axiosErr.message ?? 'حصلت مشكلة' };
  }
  return null;
}

export function authErrorMessage(
  err: unknown,
  context: 'login' | 'register' | 'reset' | 'otp',
): string {
  const norm = normalize(err);
  if (norm) {
    const { status, messageAr } = norm;
    if (status === 401) {
      return context === 'login'
        ? 'رقم الهاتف أو كلمة المرور غير صحيحة. تأكد منهما وحاول مرة أخرى.'
        : (messageAr ?? 'انتهت صلاحية الجلسة. سجّل دخولك من جديد.');
    }
    if (status === 403) return messageAr ?? 'الحساب غير مفعّل أو محظور.';
    if (status === 404) return messageAr ?? 'هذا الرقم غير مسجَّل لدينا.';
    if (status === 409) {
      return context === 'register'
        ? 'هذا الرقم مسجَّل بالفعل. جرّب تسجيل الدخول أو "نسيت كلمة المرور".'
        : (messageAr ?? 'حدث تعارض في البيانات.');
    }
    if (status === 422) return messageAr ?? 'بيانات غير صحيحة. راجع الحقول.';
    if (status === 429) return 'محاولات كتير في وقت قصير. انتظر دقيقة وحاول تاني.';
    if (status >= 500) return 'خطأ في الخادم. حاول مرة أخرى بعد قليل.';
    return messageAr ?? norm.fallback;
  }
  if (err instanceof Error && /network|fetch|ECONN|timeout/i.test(err.message)) {
    return 'تعذّر الاتصال بالخادم. تأكد من اتصالك بالإنترنت ثم حاول مرة أخرى.';
  }
  return err instanceof Error ? err.message : 'حصلت مشكلة. حاول تاني.';
}

/** Returns true when the error means "this phone is already registered". */
export function isPhoneAlreadyRegistered(err: unknown): boolean {
  const norm = normalize(err);
  return norm?.status === 409;
}
