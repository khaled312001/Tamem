import type { RequestHandler } from 'express';
import { z } from 'zod';

import { logger } from '../../utils/logger.js';
import { ok } from '../../utils/response.js';

import { getPaymobConfig, setPaymobConfig } from './paymob.config.js';

function mask(value: string | undefined, keep = 4): string | null {
  if (!value) return null;
  if (value.length <= keep) return '•••';
  return `${'•'.repeat(Math.min(8, value.length - keep))}${value.slice(-keep)}`;
}

/**
 * GET /admin/payments/gateway — exposes the current Paymob configuration in a
 * masked form (never returns the raw API key) plus the overall status flag.
 */
export const status: RequestHandler = async (_req, res, next) => {
  try {
    const cfg = await getPaymobConfig();
    const configured = Boolean(
      cfg.apiKey && (cfg.walletIntegrationId || cfg.instapayIntegrationId),
    );
    ok(res, {
      configured,
      methods: {
        vodafoneCash: !!cfg.walletIntegrationId,
        instapay: !!cfg.instapayIntegrationId,
      },
      keys: {
        apiKey: mask(cfg.apiKey),
        walletIntegrationId: cfg.walletIntegrationId ?? null,
        instapayIntegrationId: cfg.instapayIntegrationId ?? null,
        iframeId: cfg.iframeId ?? null,
        hmac: mask(cfg.hmac),
      },
    });
  } catch (err) {
    next(err);
  }
};

const saveSchema = z.object({
  apiKey: z.string().trim().optional(),
  walletIntegrationId: z.union([z.string(), z.number()]).optional(),
  instapayIntegrationId: z.union([z.string(), z.number()]).optional(),
  iframeId: z.union([z.string(), z.number()]).optional(),
  hmac: z.string().trim().optional(),
});

/**
 * PUT /admin/payments/gateway — admin saves Paymob credentials from the
 * dashboard. Persisted to the Setting table; takes effect on next request
 * (no server restart needed).
 */
export const save: RequestHandler = async (req, res, next) => {
  try {
    const input = saveSchema.parse(req.body);
    const update: Record<string, unknown> = {};
    if ('apiKey' in input) update.apiKey = input.apiKey;
    if ('walletIntegrationId' in input)
      update.walletIntegrationId =
        input.walletIntegrationId === '' ? '' : Number(input.walletIntegrationId);
    if ('instapayIntegrationId' in input)
      update.instapayIntegrationId =
        input.instapayIntegrationId === '' ? '' : Number(input.instapayIntegrationId);
    if ('iframeId' in input) update.iframeId = input.iframeId === '' ? '' : Number(input.iframeId);
    if ('hmac' in input) update.hmac = input.hmac;

    await setPaymobConfig(update);
    logger.info('paymob admin config updated');
    ok(res, { saved: true });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /admin/payments/gateway/test — performs a live Paymob authentication
 * call to confirm the API key works. Doesn't create any orders.
 */
export const testConnection: RequestHandler = async (_req, res) => {
  const cfg = await getPaymobConfig(true);
  if (!cfg.apiKey) {
    return res.json({
      data: { ok: false, reason: 'API Key مش مضبوط — احفظه من النموذج أعلاه' },
    });
  }
  try {
    const r = await fetch('https://accept.paymob.com/api/auth/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: cfg.apiKey }),
    });
    if (!r.ok) {
      const detail = await r.text();
      return res.json({
        data: {
          ok: false,
          reason: `Paymob رفض الاتصال (${r.status}): ${detail.slice(0, 200)}`,
        },
      });
    }
    const data = (await r.json()) as { token?: string };
    if (!data.token) {
      return res.json({ data: { ok: false, reason: 'Paymob لم يرجع توكن' } });
    }
    logger.info('paymob test connection succeeded');
    return res.json({
      data: {
        ok: true,
        message: 'الاتصال بـ Paymob ناجح ✓',
        tokenPreview: `${data.token.slice(0, 8)}...`,
      },
    });
  } catch (err) {
    return res.json({
      data: {
        ok: false,
        reason: err instanceof Error ? err.message : 'فشل الاتصال بـ Paymob',
      },
    });
  }
};
