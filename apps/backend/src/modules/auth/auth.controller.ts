import bcrypt from 'bcryptjs';
import type { RequestHandler } from 'express';

import { UserRole } from '@tamem/types';
import {
  googleLoginSchema,
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  refreshSchema,
  registerSchema,
} from '@tamem/validators';

import { prisma } from '../../db/prisma.js';
import { ConflictError, UnauthorizedError } from '../../utils/errors.js';
import { created, ok } from '../../utils/response.js';

import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
} from './tokens.js';

export const register: RequestHandler = async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { phone: input.phone } });
    if (existing) throw new ConflictError('Phone already registered', 'هذا الرقم مسجل بالفعل');

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await prisma.user.create({
      data: {
        phone: input.phone,
        name: input.name,
        passwordHash,
        role: UserRole.CUSTOMER,
        city: input.city,
        defaultAddress: input.address,
        isPhoneVerified: false, // OTP flow flips this
      },
    });

    const tokens = await issueTokens(user.id, user.role as UserRole, req);

    created(res, {
      user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
      tokens,
    });
  } catch (err) {
    next(err);
  }
};

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
      // Link googleId if missing
      if (!user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId: payload.sub, isPhoneVerified: true },
        });
      }
    } else {
      // First-time Google login — create a customer record. Phone collected later.
      user = await prisma.user.create({
        data: {
          phone: `g_${payload.sub}`, // placeholder; user updates real phone after via /me
          name: payload.name ?? payload.email.split('@')[0]!,
          email: payload.email,
          avatarUrl: payload.picture,
          googleId: payload.sub,
          role: UserRole.CUSTOMER,
          isPhoneVerified: false,
        },
      });
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

// Phase 1 stubs — return success without actually sending SMS.
// Day 12+: integrate with SMS gateway or WhatsApp OTP.
export const otpRequest: RequestHandler = async (req, res, next) => {
  try {
    otpRequestSchema.parse(req.body);
    ok(res, { sent: true, channel: 'STUB' });
  } catch (err) {
    next(err);
  }
};

export const otpVerify: RequestHandler = async (req, res, next) => {
  try {
    const input = otpVerifySchema.parse(req.body);
    // STUB: any 6-digit code starting with "1" passes in dev.
    if (!input.code.startsWith('1')) {
      throw new UnauthorizedError('كود التحقق غير صحيح');
    }
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
