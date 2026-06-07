/**
 * Admin endpoints for the merchant product-feed integration.
 *
 *   GET    /admin/merchants/:id/api-config      — load (token masked)
 *   PUT    /admin/merchants/:id/api-config      — upsert (token encrypted)
 *   DELETE /admin/merchants/:id/api-config      — clear config
 *   POST   /admin/merchants/:id/api-config/test — connection test + sample
 *   POST   /admin/merchants/:id/api-config/sync — manual sync now
 *   GET    /admin/merchants/:id/api-config/logs — recent sync log rows
 */
import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { ConflictError, NotFoundError } from '../../utils/errors.js';
import { encryptSecret, maskSecret, decryptSecret } from '../../utils/crypto.js';
import { ok } from '../../utils/response.js';

import { nextSyncAfter, runSync, testConnection } from './productSync.engine.js';

const param = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new NotFoundError('Resource');
  return v;
};

const configSchema = z.object({
  apiUrl: z.string().url().max(500),
  method: z.enum(['GET', 'POST']).default('GET'),
  authType: z.enum(['NONE', 'API_KEY', 'BEARER', 'BASIC']).default('NONE'),
  authHeaderName: z.string().max(60).optional().nullable(),
  /** Plaintext token — server encrypts before storing. Send null to keep
   *  the existing one; send empty string to clear. */
  token: z.string().max(2000).optional().nullable(),
  extraHeaders: z.record(z.string()).optional().nullable(),
  requestBody: z.record(z.unknown()).optional().nullable(),
  productsPath: z.string().max(120).optional().nullable(),
  fieldMapping: z.record(z.string()).optional().nullable(),
  syncInterval: z
    .enum(['DISABLED', 'EVERY_15_MIN', 'EVERY_30_MIN', 'HOURLY', 'DAILY'])
    .default('DISABLED'),
  missingPolicy: z
    .enum(['IGNORE', 'MARK_UNAVAILABLE', 'HIDE', 'DELETE'])
    .default('MARK_UNAVAILABLE'),
  isActive: z.boolean().default(true),
});

/** Strip the encrypted secret before sending the config back. */
function safeConfig(c: {
  tokenSecret: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
}) {
  const decrypted = c.tokenSecret ? decryptSecret(c.tokenSecret) : '';
  return {
    ...c,
    tokenSecret: undefined, // never leak the ciphertext
    hasToken: !!decrypted,
    tokenMasked: maskSecret(decrypted),
  };
}

/** GET /admin/merchants/:id/api-config */
export const getConfig: RequestHandler = async (req, res, next) => {
  try {
    const merchantId = param(req.params.id);
    const cfg = await prisma.merchantApiConfig.findUnique({
      where: { merchantId },
    });
    ok(res, cfg ? safeConfig(cfg) : null);
  } catch (err) {
    next(err);
  }
};

/** PUT /admin/merchants/:id/api-config — upsert the recipe. */
export const upsertConfig: RequestHandler = async (req, res, next) => {
  try {
    const merchantId = param(req.params.id);
    const input = configSchema.parse(req.body);

    const merchant = await prisma.merchantProfile.findUnique({
      where: { id: merchantId },
      select: { id: true },
    });
    if (!merchant) throw new NotFoundError('Merchant');

    // Token rules:
    //   null         → keep existing
    //   ""           → clear it (no auth)
    //   non-empty    → encrypt + store
    const existing = await prisma.merchantApiConfig.findUnique({
      where: { merchantId },
      select: { tokenSecret: true },
    });
    let tokenSecret: string | null | undefined;
    if (input.token === null || input.token === undefined) {
      tokenSecret = existing?.tokenSecret ?? null;
    } else if (input.token === '') {
      tokenSecret = null;
    } else {
      tokenSecret = encryptSecret(input.token);
    }

    const cfg = await prisma.merchantApiConfig.upsert({
      where: { merchantId },
      create: {
        merchantId,
        apiUrl: input.apiUrl,
        method: input.method,
        authType: input.authType,
        authHeaderName: input.authHeaderName ?? null,
        tokenSecret: tokenSecret ?? null,
        extraHeaders: (input.extraHeaders ?? undefined) as never,
        requestBody: (input.requestBody ?? undefined) as never,
        productsPath: input.productsPath ?? null,
        fieldMapping: (input.fieldMapping ?? undefined) as never,
        syncInterval: input.syncInterval,
        missingPolicy: input.missingPolicy,
        isActive: input.isActive,
        nextSyncAt: nextSyncAfter(input.syncInterval),
      },
      update: {
        apiUrl: input.apiUrl,
        method: input.method,
        authType: input.authType,
        authHeaderName: input.authHeaderName ?? null,
        tokenSecret: tokenSecret ?? null,
        extraHeaders: (input.extraHeaders ?? undefined) as never,
        requestBody: (input.requestBody ?? undefined) as never,
        productsPath: input.productsPath ?? null,
        fieldMapping: (input.fieldMapping ?? undefined) as never,
        syncInterval: input.syncInterval,
        missingPolicy: input.missingPolicy,
        isActive: input.isActive,
        nextSyncAt: nextSyncAfter(input.syncInterval),
      },
    });
    ok(res, safeConfig(cfg));
  } catch (err) {
    next(err);
  }
};

export const deleteConfig: RequestHandler = async (req, res, next) => {
  try {
    const merchantId = param(req.params.id);
    await prisma.merchantApiConfig.delete({ where: { merchantId } }).catch(() => undefined);
    ok(res, { deleted: true });
  } catch (err) {
    next(err);
  }
};

/** POST /admin/merchants/:id/api-config/test */
export const testConnect: RequestHandler = async (req, res, next) => {
  try {
    const merchantId = param(req.params.id);
    const cfg = await prisma.merchantApiConfig.findUnique({ where: { merchantId } });
    if (!cfg) throw new ConflictError('NO_CONFIG', 'لم يتم حفظ إعدادات API بعد');
    const result = await testConnection(cfg);
    // Persist the success/failure so the dashboard badge stays in sync
    // without forcing a follow-up GET.
    await prisma.merchantApiConfig.update({
      where: { id: cfg.id },
      data: {
        isConnected: result.ok,
        lastError: result.ok ? null : (result.error ?? null),
      },
    });
    ok(res, result);
  } catch (err) {
    next(err);
  }
};

/** POST /admin/merchants/:id/api-config/sync — manual sync. */
export const triggerSync: RequestHandler = async (req, res, next) => {
  try {
    const merchantId = param(req.params.id);
    const cfg = await prisma.merchantApiConfig.findUnique({ where: { merchantId } });
    if (!cfg) throw new ConflictError('NO_CONFIG', 'لم يتم حفظ إعدادات API بعد');
    const result = await runSync(cfg, {
      trigger: 'MANUAL',
      triggeredById: req.user?.id,
    });
    ok(res, result);
  } catch (err) {
    next(err);
  }
};

/** GET /admin/merchants/:id/api-config/logs */
export const listLogs: RequestHandler = async (req, res, next) => {
  try {
    const merchantId = param(req.params.id);
    const logs = await prisma.productSyncLog.findMany({
      where: { merchantId },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    ok(res, logs);
  } catch (err) {
    next(err);
  }
};
