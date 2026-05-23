import { createHash, randomBytes } from 'crypto';

import jwt, { type SignOptions } from 'jsonwebtoken';

import type { UserRole } from '@tamem/types';

import { env } from '../../config/env.js';

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as SignOptions['expiresIn'],
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

export function refreshTokenExpiry(): Date {
  // parse JWT_REFRESH_TTL like "30d" / "12h" / "60m"
  const ttl = env.JWT_REFRESH_TTL;
  const match = ttl.match(/^(\d+)([dhm])$/);
  const now = Date.now();
  if (!match) return new Date(now + 30 * 24 * 60 * 60 * 1000);
  const value = Number(match[1]);
  const unit = match[2];
  const mult = unit === 'd' ? 86_400_000 : unit === 'h' ? 3_600_000 : 60_000;
  return new Date(now + value * mult);
}
