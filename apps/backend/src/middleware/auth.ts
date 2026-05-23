import type { RequestHandler } from 'express';

import type { UserRole } from '@tamem/types';

import { verifyAccessToken } from '../modules/auth/tokens.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(new UnauthorizedError());

  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new UnauthorizedError('انتهت صلاحية الجلسة'));
  }
};

export const requireRole =
  (...roles: UserRole[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!roles.includes(req.user.role)) return next(new ForbiddenError('صلاحيات غير كافية'));
    next();
  };
