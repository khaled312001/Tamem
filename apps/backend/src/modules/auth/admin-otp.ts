/**
 * Admin login OTP — a second factor for admin/super-admin accounts.
 *
 * Flow:
 *   1. POST /auth/login with correct credentials.
 *   2. If role is ADMIN/SUPER_ADMIN, the controller calls `startAdminOtp`:
 *      generates a 6-digit code, stashes it in memory keyed by an opaque
 *      `pendingToken`, and emails the code to every recipient in
 *      env.ADMIN_OTP_RECIPIENTS.
 *   3. Client submits POST /auth/otp/verify with the pendingToken + code.
 *      On success the real tokens are issued and the pending entry is cleared.
 *
 * The OTP lives entirely in memory. A restart clears all pending OTPs — the
 * admin just has to log in again, which is fine for a low-volume flow. If we
 * ever need to survive restarts, promote this to a lightweight DB table.
 */
import crypto from 'node:crypto';

import { env, adminOtpRecipients } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { sendMail } from '../../lib/mail.js';

interface Pending {
  userId: string;
  role: string;
  identifier: string;
  code: string;
  expiresAt: number; // ms
  attempts: number;
}

const store = new Map<string, Pending>();

// Cleanup expired entries once a minute so the map doesn't grow unbounded
// under attack. Keeping it here (module top-level) means one interval per
// process, no unref needed since Passenger keeps the worker alive.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store) if (v.expiresAt < now) store.delete(k);
}, 60_000).unref?.();

function genCode(): string {
  // 6 digits, cryptographically secure.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function genPending(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export interface OtpDispatch {
  pendingToken: string;
  expiresInSec: number;
  sentTo: string[];
}

export async function startAdminOtp(args: {
  userId: string;
  role: string;
  identifier: string; // email or phone the user typed — used in the email body
}): Promise<OtpDispatch> {
  const code = genCode();
  const pendingToken = genPending();
  const ttlMs = env.ADMIN_OTP_TTL_MINUTES * 60_000;
  store.set(pendingToken, {
    userId: args.userId,
    role: args.role,
    identifier: args.identifier,
    code,
    expiresAt: Date.now() + ttlMs,
    attempts: 0,
  });

  const recipients = adminOtpRecipients;
  const ttlMin = env.ADMIN_OTP_TTL_MINUTES;
  const subject = `[تميم] رمز الدخول للوحة التحكم: ${code}`;
  const text =
    `رمز الدخول للوحة تحكم تميم:\n\n` +
    `    ${code}\n\n` +
    `صالح لمدة ${ttlMin} دقائق.\n` +
    `طلب الدخول: ${args.identifier}\n` +
    `وقت الطلب: ${new Date().toISOString()}\n\n` +
    `لو مش انت اللي طلبت الدخول، تجاهل الرسالة وغيّر كلمة المرور فوراً.`;
  const html = `<!doctype html><html lang="ar" dir="rtl"><body style="font-family:Tahoma,Arial;padding:20px;background:#f5f6f8">
  <div style="max-width:520px;margin:auto;background:#fff;border:1px solid #ddd;border-radius:12px;padding:28px">
    <h2 style="color:#E0301E;margin:0 0 8px">رمز الدخول للوحة تحكم تميم</h2>
    <p style="color:#555;margin:0 0 20px">استخدم الرمز التالي لإكمال تسجيل الدخول:</p>
    <div style="font-family:monospace;font-size:36px;font-weight:800;letter-spacing:8px;text-align:center;background:#241310;color:#F2A93B;padding:20px;border-radius:10px;margin:10px 0">${code}</div>
    <p style="color:#666;font-size:13px;margin-top:20px">
      صالح لمدة <b>${ttlMin} دقائق</b> فقط.<br>
      طلب الدخول: <span style="direction:ltr;display:inline-block">${args.identifier}</span><br>
      وقت الطلب: <span style="direction:ltr;display:inline-block">${new Date().toISOString().slice(0, 19).replace('T', ' ')}</span>
    </p>
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
    <p style="color:#999;font-size:12px;text-align:center">
      لو مش انت اللي طلبت الدخول، تجاهل الرسالة وغيّر كلمة المرور فوراً.
    </p>
  </div>
</body></html>`;

  const results = await Promise.allSettled(
    recipients.map((to) => sendMail({ to, subject, text, html })),
  );
  const okCount = results.filter((r) => r.status === 'fulfilled' && r.value).length;
  if (okCount === 0) {
    logger.error({ recipients, results }, '[admin-otp] failed to send OTP to any recipient');
  } else {
    logger.info({ recipients, okCount }, '[admin-otp] OTP sent');
  }

  return { pendingToken, expiresInSec: ttlMin * 60, sentTo: recipients };
}

export interface OtpVerifyResult {
  userId: string;
  role: string;
}

export function verifyAdminOtp(pendingToken: string, code: string): OtpVerifyResult {
  const pending = store.get(pendingToken);
  if (!pending) throw new Error('EXPIRED_OR_UNKNOWN');
  if (pending.expiresAt < Date.now()) {
    store.delete(pendingToken);
    throw new Error('EXPIRED_OR_UNKNOWN');
  }
  pending.attempts += 1;
  if (pending.attempts > 5) {
    store.delete(pendingToken);
    throw new Error('TOO_MANY_ATTEMPTS');
  }
  if (pending.code !== code.trim()) throw new Error('BAD_CODE');
  store.delete(pendingToken);
  return { userId: pending.userId, role: pending.role };
}
