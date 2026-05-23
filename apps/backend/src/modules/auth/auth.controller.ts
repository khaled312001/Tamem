import { compare, hash } from 'bcryptjs';
import type { RequestHandler } from 'express';

import { UserRole } from '@tamem/types';
import {
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

    const passwordHash = await hash(input.password, 12);
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

    const ok2 = await compare(input.password, user.passwordHash);
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
