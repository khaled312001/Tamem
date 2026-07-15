import { createHash, randomBytes } from 'crypto';

import jwt, { type SignOptions } from 'jsonwebtoken';

import type { UserRole } from '@tamem/types';

import { env } from '../../config/env.js';

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  // Admin sessions live for ADMIN_SESSION_TTL_HOURS (default 6h). Regular
  // roles keep the shorter JWT_ACCESS_TTL (default 15m) and rely on
  // refresh-token rotation to stay logged in for weeks.
  const isAdmin = payload.role === 'ADMIN' || payload.role === 'SUPER_ADMIN';
  const ttl = isAdmin ? `${env.ADMIN_SESSION_TTL_HOURS}h` : env.JWT_ACCESS_TTL;
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: ttl as SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function generateRefreshToken(): { raw: string; hash: string } {
  const raw = randomBytes(48).toString('base64url');
  const hash = createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function refreshTokenExpiry(role?: UserRole): Date {
  const now = Date.now();
  // Admins: match the 6h access TTL so refresh can't extend the session past
  // one login. When the access token dies, the refresh has also died — user
  // must go through OTP again.
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
    return new Date(now + env.ADMIN_SESSION_TTL_HOURS * 3_600_000);
  }
  // Non-admins: use configured JWT_REFRESH_TTL (default 30d).
  const ttl = env.JWT_REFRESH_TTL;
  const match = ttl.match(/^(\d+)([dhm])$/);
  if (!match) return new Date(now + 30 * 24 * 60 * 60 * 1000);
  const value = Number(match[1]);
  const unit = match[2];
  const mult = unit === 'd' ? 86_400_000 : unit === 'h' ? 3_600_000 : 60_000;
  return new Date(now + value * mult);
}
