import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { NotFoundError, UnauthorizedError } from '../../utils/errors.js';
import { ok } from '../../utils/response.js';

const PROFILE_FIELDS = {
  id: true,
  phone: true,
  name: true,
  email: true,
  avatarUrl: true,
  role: true,
  isPhoneVerified: true,
  isActive: true,
  city: true,
  governorate: true,
  defaultAddress: true,
  createdAt: true,
} as const;

const meUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    email: z.string().email().optional(),
    city: z.string().trim().max(100).optional(),
    governorate: z.string().trim().max(100).optional(),
    defaultAddress: z.string().trim().max(500).optional(),
    avatarUrl: z.string().url().optional(),
  })
  .strict();

const fcmTokenSchema = z.object({
  fcmToken: z.string().min(10).max(500),
});

export const getMe: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: PROFILE_FIELDS,
    });
    if (!user) throw new NotFoundError('User', 'المستخدم غير موجود');
    ok(res, user);
  } catch (err) {
    next(err);
  }
};

export const updateMe: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const input = meUpdateSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: input,
      select: PROFILE_FIELDS,
    });
    ok(res, user);
  } catch (err) {
    next(err);
  }
};

export const setFcmToken: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const input = fcmTokenSchema.parse(req.body);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { fcmToken: input.fcmToken },
    });
    ok(res, { saved: true });
  } catch (err) {
    next(err);
  }
};
