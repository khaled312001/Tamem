import { createHash, randomInt } from 'node:crypto';

import bcrypt from 'bcryptjs';
import type { RequestHandler } from 'express';
import { z } from 'zod';

import { UserRole } from '@tamem/types';
import {
  googleLoginSchema,
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  refreshSchema,
  registerSchema,
} from '@tamem/validators';

import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { ConflictError, UnauthorizedError } from '../../utils/errors.js';
import { created, ok } from '../../utils/response.js';

import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
} from './tokens.js';

function generatePasswordResetCode(): string {
  // 6-digit zero-padded
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}
function hashResetCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export const register: RequestHandler = async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { phone: input.phone } });
    if (existing) throw new ConflictError('Phone already registered', 'هذا الرقم مسجل بالفعل');

    const passwordHash = await bcrypt.hash(input.password, 12);
    // Only allow CUSTOMER / MERCHANT via the public signup endpoint — DRIVER /
    // ADMIN are admin-provisioned. Missing role → CUSTOMER (existing behavior).
    const requestedRole: UserRole =
      input.role === 'MERCHANT' ? UserRole.MERCHANT : UserRole.CUSTOMER;

    const user = await prisma.user.create({
      data: {
        phone: input.phone,
        name: input.name,
        passwordHash,
        role: requestedRole,
        city: input.city,
        defaultAddress: input.address,
        isPhoneVerified: false, // OTP flow flips this
      },
    });

    // When a brand-new user signs up as MERCHANT, seed a minimal
    // MerchantProfile so the merchant onboarding flow always has a row to
    // edit instead of forcing a separate "create profile first" step. The
    // profile defaults are placeholders — the merchant fills them in later
    // via the MerchantSignup screen.
    if (requestedRole === UserRole.MERCHANT) {
      await ensureMerchantProfile(user.id, input.city);
    }

    const tokens = await issueTokens(user.id, user.role as UserRole, req);

    created(res, {
      user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
      tokens,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Seed a placeholder MerchantProfile for a user newly registered as MERCHANT.
 * Uses the first active Category as a default — the merchant changes this
 * during onboarding. No-op if a profile already exists (idempotent).
 */
async function ensureMerchantProfile(userId: string, city?: string): Promise<void> {
  const existing = await prisma.merchantProfile.findUnique({ where: { userId } });
  if (existing) return;

  // Pick any category to satisfy the FK — preference for an active one.
  const defaultCategory = await prisma.category.findFirst({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  if (!defaultCategory) {
    // No categories configured yet — skip profile creation so signup still
    // succeeds. The merchant will create the profile manually later.
    return;
  }

  await prisma.merchantProfile.create({
    data: {
      userId,
      storeName: 'متجري',
      storeNameAr: 'متجري',
      categoryId: defaultCategory.id,
      addressLine: '',
      lat: 0,
      lng: 0,
      governorate: city ?? '',
      city: city ?? '',
    },
  });
}

export const login: RequestHandler = async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { phone: input.phone } });
    if (!user || !user.passwordHash) throw new UnauthorizedError('بيانات الدخول غير صحيحة');

    const ok2 = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok2) throw new UnauthorizedError('بيانات الدخول غير صحيحة');
    if (!user.isActive) throw new UnauthorizedError('الحساب غير مفعّل');

    const tokens = await issueTokens(user.id, user.role as UserRole, req);
    ok(res, {
      user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
      tokens,
    });
  } catch (err) {
    next(err);
  }
};

export const refresh: RequestHandler = async (req, res, next) => {
  try {
    const input = refreshSchema.parse(req.body);
    const tokenHash = hashRefreshToken(input.refreshToken);
    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token غير صالح');
    }

    // rotate
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    const tokens = await issueTokens(stored.userId, stored.user.role as UserRole, req);
    ok(res, tokens);
  } catch (err) {
    next(err);
  }
};

export const logout: RequestHandler = async (req, res, next) => {
  try {
    const input = refreshSchema.parse(req.body);
    const tokenHash = hashRefreshToken(input.refreshToken);
    await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

// Google OAuth — verifies the Google ID token from mobile app and signs in or upserts the user.
// Returns null gracefully if GOOGLE_CLIENT_ID is not configured.
export const googleLogin: RequestHandler = async (req, res, next) => {
  try {
    const input = googleLoginSchema.parse(req.body);
    const { env } = await import('../../config/env.js');
    if (!env.GOOGLE_CLIENT_ID) {
      throw new UnauthorizedError('Google login غير مفعّل على السيرفر');
    }
    const { OAuth2Client } = await import('google-auth-library');
    const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: input.idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedError('Google token غير صالح');
    }

    // Upsert by googleId (preferred) or email
    let user = await prisma.user.findUnique({ where: { googleId: payload.sub } });
    if (!user && payload.email) {
      user = await prisma.user.findUnique({ where: { email: payload.email } });
    }

    if (user) {
      // Link googleId if missing. Returning users keep their existing role —
      // we deliberately ignore the `role` field on the request to prevent a
      // customer from silently promoting themselves to MERCHANT via the
      // Google flow.
      if (!user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId: payload.sub, isPhoneVerified: true },
        });
      }
    } else {
      // First-time Google login — honor the requested role (CUSTOMER /
      // MERCHANT only). Anything else (or missing) falls back to CUSTOMER.
      const requestedRole: UserRole =
        input.role === 'MERCHANT' ? UserRole.MERCHANT : UserRole.CUSTOMER;

      user = await prisma.user.create({
        data: {
          phone: `g_${payload.sub}`, // placeholder; user updates real phone after via /me
          name: payload.name ?? payload.email.split('@')[0]!,
          email: payload.email,
          avatarUrl: payload.picture,
          googleId: payload.sub,
          role: requestedRole,
          isPhoneVerified: false,
        },
      });

      if (requestedRole === UserRole.MERCHANT) {
        await ensureMerchantProfile(user.id);
      }
    }

    const tokens = await issueTokens(user.id, user.role as UserRole, req);
    ok(res, {
      user: { id: user.id, name: user.name, phone: user.phone, email: user.email, role: user.role },
      tokens,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/forgot-password — initiate a password reset by phone number.
 * In dev/stub mode we return the reset code in the response so the mobile
 * app can autofill it for testing. In production this code would be sent
 * over SMS / WhatsApp and the response would be `{ sent: true }` only.
 *
 * The code is a 6-digit number stored hashed on the User record with a
 * 10-minute expiry. We deliberately don't reveal whether the phone exists
 * — return `{ sent: true }` even on unknown numbers to prevent enumeration.
 */
export const forgotPassword: RequestHandler = async (req, res, next) => {
  try {
    const input = z.object({ phone: z.string().trim().min(8) }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { phone: input.phone } });
    if (!user) {
      ok(res, { sent: true });
      return;
    }
    const code = generatePasswordResetCode();
    const codeHash = hashResetCode(code);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetHash: codeHash,
        passwordResetExpiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    // STUB: include the code in the response so dev / QA can copy it.
    const debugCode = env.NODE_ENV === 'production' ? undefined : code;
    ok(res, { sent: true, ...(debugCode ? { debugCode } : {}) });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/reset-password — verify the reset code and set a new password.
 * Same hash-verify pattern as the refresh token: hash the user-supplied code
 * with the same algorithm and compare to the stored hash. Clear the reset
 * fields + revoke all existing refresh tokens so any logged-in session on
 * other devices is killed (defense in depth).
 */
export const resetPassword: RequestHandler = async (req, res, next) => {
  try {
    const input = z
      .object({
        phone: z.string().trim().min(8),
        code: z.string().regex(/^\d{6}$/, 'كود التحقق 6 أرقام'),
        newPassword: z.string().min(8).max(100),
      })
      .parse(req.body);

    const user = await prisma.user.findUnique({ where: { phone: input.phone } });
    if (!user || !user.passwordResetHash || !user.passwordResetExpiresAt) {
      throw new UnauthorizedError('كود التحقق غير صحيح أو منتهي');
    }
    if (user.passwordResetExpiresAt < new Date()) {
      throw new UnauthorizedError('انتهت صلاحية كود التحقق — اطلب كوداً جديداً');
    }
    if (hashResetCode(input.code) !== user.passwordResetHash) {
      throw new UnauthorizedError('كود التحقق غير صحيح');
    }

    const newHash = await bcrypt.hash(input.newPassword, 12);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newHash,
          passwordResetHash: null,
          passwordResetExpiresAt: null,
        },
      }),
      // Kill every refresh token so other devices are logged out.
      prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    // Issue a fresh session immediately so the mobile flow can land on Home
    // without forcing the user to type the new password again.
    const tokens = await issueTokens(user.id, user.role as UserRole, req);
    ok(res, {
      user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
      tokens,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/otp/request — generate a 6-digit OTP, persist it hashed
 * with a 5-minute expiry, and dispatch it over WhatsApp (WppConnect first,
 * Cloud API fallback). Per-phone rate-limited to one request per 60s.
 *
 * In non-production we additionally return the code in the response under
 * `debugCode` so the mobile QA flow can autofill — this is gated by
 * NODE_ENV so it never leaks in prod.
 */
export const otpRequest: RequestHandler = async (req, res, next) => {
  try {
    const input = otpRequestSchema.parse(req.body);
    const { sendWhatsAppMessage } = await import('../../integrations/whatsapp.js');

    const recent = await prisma.otpCode.findFirst({
      where: { phone: input.phone, createdAt: { gt: new Date(Date.now() - 60_000) } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      ok(res, { sent: true, channel: 'COOLDOWN', retryInSec: 60 });
      return;
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = createHash('sha256').update(code).digest('hex');

    await prisma.otpCode.create({
      data: {
        phone: input.phone,
        codeHash,
        purpose: 'VERIFY',
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });

    const text = `كود التحقق الخاص بك في تميم للتوصيل: ${code}\nصالح لمدة 5 دقائق. لا تشاركه مع أحد.`;

    // Try WhatsApp first (preferred — branded sender + cheap), fall back
    // to SMS for users without WhatsApp. If both fail, channel is NONE
    // and the dev-mode debugCode echo still lets QA exercise the flow.
    let channel: 'WHATSAPP' | 'SMS' | 'NONE' = 'NONE';
    const waOk = await sendWhatsAppMessage({ toPhone: input.phone, text });
    if (waOk) {
      channel = 'WHATSAPP';
    } else {
      const { sendSms } = await import('../../integrations/sms.js');
      const smsOk = await sendSms({ toPhone: input.phone, text });
      if (smsOk) channel = 'SMS';
    }

    const debugCode = env.NODE_ENV === 'production' ? undefined : code;
    ok(res, { sent: true, channel, ...(debugCode ? { debugCode } : {}) });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/otp/verify — verify the 6-digit code against the latest
 * non-consumed, non-expired row for the phone. Tracks attempts and locks
 * the row after 5 failed tries (must request a new code).
 */
export const otpVerify: RequestHandler = async (req, res, next) => {
  try {
    const input = otpVerifySchema.parse(req.body);

    const row = await prisma.otpCode.findFirst({
      where: { phone: input.phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) throw new UnauthorizedError('كود التحقق منتهي أو غير موجود');
    if (row.attempts >= 5) {
      throw new UnauthorizedError('تم تجاوز عدد المحاولات — اطلب كوداً جديداً');
    }

    const submittedHash = createHash('sha256').update(input.code).digest('hex');
    if (submittedHash !== row.codeHash) {
      await prisma.otpCode.update({
        where: { id: row.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedError('كود التحقق غير صحيح');
    }

    // mark the OTP row consumed first, then sign the user in.
    await prisma.otpCode.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    });

    const user = await prisma.user.findUnique({ where: { phone: input.phone } });
    if (!user) throw new UnauthorizedError('المستخدم غير موجود');
    if (!user.isPhoneVerified) {
      await prisma.user.update({ where: { id: user.id }, data: { isPhoneVerified: true } });
    }
    const tokens = await issueTokens(user.id, user.role as UserRole, req);
    ok(res, { user: { id: user.id, name: user.name, phone: user.phone }, tokens });
  } catch (err) {
    next(err);
  }
};

async function issueTokens(
  userId: string,
  role: UserRole,
  req: { headers: Record<string, unknown>; ip?: string },
) {
  const accessToken = signAccessToken({ sub: userId, role });
  const { raw, hash: refreshHash } = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: refreshHash,
      userAgent:
        typeof req.headers['user-agent'] === 'string'
          ? (req.headers['user-agent'] as string).slice(0, 500)
          : null,
      ip: req.ip,
      expiresAt: refreshTokenExpiry(),
    },
  });
  return { accessToken, refreshToken: raw };
}
