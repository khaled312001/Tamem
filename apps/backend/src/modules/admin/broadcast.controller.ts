/**
 * Admin broadcast — push a one-off announcement to every user (or to a
 * specific role slice). Creates persistent Notification rows so the
 * message shows up in the in-app notifications list, then fans out FCM
 * push notifications to whoever has a registered device token.
 *
 * Push delivery is best-effort: a user who hasn't installed the app yet
 * (no fcmToken) still sees the message next time they open the app, via
 * the persisted Notification record. Failures on individual sends do not
 * block other users — they're logged and counted as failures in the
 * response so the admin can tell how many devices actually got pinged.
 */
import type { RequestHandler } from 'express';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { sendPushToUser } from '../../integrations/fcm.js';
import { logger } from '../../utils/logger.js';
import { BadRequestError } from '../../utils/errors.js';
import { ok } from '../../utils/response.js';

const broadcastSchema = z.object({
  titleAr: z.string().min(1).max(120),
  bodyAr: z.string().min(1).max(1000),
  /** Audience filter. ALL fans out to every user across roles. */
  target: z.enum(['ALL', 'CUSTOMER', 'MERCHANT', 'DRIVER', 'ADMIN']).default('ALL'),
  /** Optional admin-defined kind tag, surfaced in the notification.data
   *  payload so the mobile can route the user to the right screen later. */
  kind: z.enum(['ANNOUNCEMENT', 'PROMO', 'ALERT']).default('ANNOUNCEMENT'),
});

export type BroadcastInput = z.infer<typeof broadcastSchema>;

export const broadcast: RequestHandler = async (req, res, next) => {
  try {
    const parsed = broadcastSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const { titleAr, bodyAr, target, kind } = parsed.data;

    // Resolve the audience. ALL → no role filter; otherwise filter to one role.
    const where = target === 'ALL' ? {} : { role: target as UserRole };
    const users = await prisma.user.findMany({
      where: { ...where, isActive: true },
      select: { id: true, fcmToken: true },
    });

    if (users.length === 0) {
      ok(res, { recipients: 0, pushSent: 0, pushFailed: 0 });
      return;
    }

    // 1. Persist a Notification row per user — this is what the in-app
    //    notifications list reads from. createMany is a single SQL insert
    //    so this stays fast even at thousands of users.
    const now = new Date();
    await prisma.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        type: kind === 'ALERT' ? 'SYSTEM' : 'PROMO',
        title: titleAr,
        titleAr,
        body: bodyAr,
        bodyAr,
        channel: 'IN_APP',
        data: { broadcastKind: kind, sentAt: now.toISOString() },
        sentAt: now,
      })),
      skipDuplicates: false,
    });

    // 2. Fire-and-await FCM pushes to whoever has a device token. We do
    //    them in parallel but bounded — 16 at a time — so we don't burn
    //    file descriptors or get rate-limited by FCM on huge audiences.
    const withTokens = users.filter((u) => u.fcmToken);
    let pushSent = 0;
    let pushFailed = 0;
    const CHUNK = 16;
    for (let i = 0; i < withTokens.length; i += CHUNK) {
      const slice = withTokens.slice(i, i + CHUNK);
      const results = await Promise.allSettled(
        slice.map((u) =>
          sendPushToUser(u.id, {
            title: titleAr,
            body: bodyAr,
            data: { broadcastKind: kind, scope: target },
          }),
        ),
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) pushSent += 1;
        else pushFailed += 1;
      }
    }

    logger.info(
      { recipients: users.length, pushSent, pushFailed, target, kind },
      'admin broadcast dispatched',
    );

    ok(res, { recipients: users.length, pushSent, pushFailed });
  } catch (err) {
    next(err);
  }
};
