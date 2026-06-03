/**
 * Firebase Cloud Messaging dispatcher.
 *
 * The backend dispatches push notifications to a user's Android device
 * by looking up the `fcmToken` we stored when the mobile app called
 * POST /me/fcm-token. This file isolates the firebase-admin SDK so the
 * server can boot even when the SDK isn't installed yet — useful in
 * dev where the FCM service account JSON is gated behind a vault.
 *
 * Behavior:
 *   - If `FCM_SERVICE_ACCOUNT_JSON_PATH` is unset → no-op (logs at debug).
 *   - If firebase-admin is not installed → no-op (logs at debug).
 *   - Stale token errors (registration-token-not-registered) clear the
 *     token from the user row so we don't keep retrying it.
 */
import { readFileSync } from 'node:fs';

import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

type FirebaseMessaging = {
  send(message: {
    token: string;
    notification: { title: string; body: string };
    data?: Record<string, string>;
    android?: { priority: 'high' | 'normal' };
  }): Promise<string>;
};

let initialized = false;
let messaging: FirebaseMessaging | null = null;

async function ensureInit(): Promise<FirebaseMessaging | null> {
  if (initialized) return messaging;
  initialized = true;

  if (!env.FCM_SERVICE_ACCOUNT_JSON_PATH) {
    logger.debug('FCM disabled: FCM_SERVICE_ACCOUNT_JSON_PATH not set');
    return null;
  }

  let admin: typeof import('firebase-admin');
  try {
    admin = (await import('firebase-admin')).default;
  } catch (err) {
    logger.warn(
      { err },
      'FCM disabled: firebase-admin not installed — run pnpm add firebase-admin',
    );
    return null;
  }

  try {
    const raw = readFileSync(env.FCM_SERVICE_ACCOUNT_JSON_PATH, 'utf-8');
    const serviceAccount = JSON.parse(raw) as Record<string, unknown>;
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as never),
    });
    messaging = admin.messaging() as FirebaseMessaging;
    logger.info('FCM initialized');
    return messaging;
  } catch (err) {
    logger.error({ err }, 'FCM init failed');
    return null;
  }
}

/**
 * Send a push notification to a single Expo / FCM token.
 * Returns true on success. Safe to call without awaiting.
 */
export async function sendPushToToken(token: string, payload: PushPayload): Promise<boolean> {
  if (!token) return false;
  const msg = await ensureInit();
  if (!msg) return false;
  try {
    await msg.send({
      token,
      notification: { title: payload.title, body: payload.body },
      data: payload.data,
      android: { priority: 'high' },
    });
    return true;
  } catch (err: unknown) {
    const errCode =
      typeof err === 'object' && err && 'code' in err
        ? String((err as { code: unknown }).code)
        : '';
    if (
      errCode === 'messaging/registration-token-not-registered' ||
      errCode === 'messaging/invalid-registration-token'
    ) {
      // The token is dead — wipe it so we don't keep retrying.
      try {
        await prisma.user.updateMany({
          where: { fcmToken: token },
          data: { fcmToken: null },
        });
      } catch {
        /* swallow */
      }
      logger.debug({ token }, 'FCM token stale — cleared from user');
    } else {
      logger.warn({ err, errCode }, 'FCM send failed');
    }
    return false;
  }
}

/**
 * Lookup the user's stored fcmToken and dispatch — convenience helper
 * for the order events bus. No-op when the user has never registered
 * a token (Web sessions, users who declined permission, etc.).
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fcmToken: true },
    });
    if (!user?.fcmToken) return false;
    return await sendPushToToken(user.fcmToken, payload);
  } catch (err) {
    logger.warn({ err, userId }, 'sendPushToUser lookup failed');
    return false;
  }
}
