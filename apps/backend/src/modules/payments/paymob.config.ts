/**
 * Runtime config layer for Paymob.
 *
 * Resolution order (first match wins):
 *   1. Admin-saved values in the Setting table (so the dashboard can edit them
 *      live without redeploying).
 *   2. Process env vars (PAYMOB_API_KEY, …) — useful for CI / first boot.
 *
 * Values are cached in-memory for 30s so per-request reads don't hammer the DB
 * during a burst (the dashboard polls status every 15s).
 */
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';

const SETTING_KEYS = {
  apiKey: 'paymob_api_key',
  walletIntegrationId: 'paymob_wallet_integration_id',
  instapayIntegrationId: 'paymob_instapay_integration_id',
  iframeId: 'paymob_iframe_id',
  hmac: 'paymob_hmac',
} as const;

type Key = keyof typeof SETTING_KEYS;

export interface PaymobConfig {
  apiKey?: string;
  walletIntegrationId?: number;
  instapayIntegrationId?: number;
  iframeId?: number;
  hmac?: string;
}

let cache: { value: PaymobConfig; expires: number } | null = null;

function asString(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined;
  if (typeof v === 'number') return String(v);
  return undefined;
}
function asInt(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') {
    const n = Number(v.trim());
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
  return undefined;
}

export async function getPaymobConfig(force = false): Promise<PaymobConfig> {
  if (!force && cache && cache.expires > Date.now()) return cache.value;

  const rows = await prisma.setting.findMany({
    where: { key: { in: Object.values(SETTING_KEYS) } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));

  const cfg: PaymobConfig = {
    apiKey: asString(byKey.get(SETTING_KEYS.apiKey)) ?? env.PAYMOB_API_KEY,
    walletIntegrationId:
      asInt(byKey.get(SETTING_KEYS.walletIntegrationId)) ?? env.PAYMOB_WALLET_INTEGRATION_ID,
    instapayIntegrationId:
      asInt(byKey.get(SETTING_KEYS.instapayIntegrationId)) ?? env.PAYMOB_INSTAPAY_INTEGRATION_ID,
    iframeId: asInt(byKey.get(SETTING_KEYS.iframeId)) ?? env.PAYMOB_IFRAME_ID,
    hmac: asString(byKey.get(SETTING_KEYS.hmac)) ?? env.PAYMOB_HMAC,
  };

  cache = { value: cfg, expires: Date.now() + 30_000 };
  return cfg;
}

export async function setPaymobConfig(input: Partial<PaymobConfig>): Promise<PaymobConfig> {
  // Only persist keys the caller explicitly sent. Empty string = clear.
  const ops: Array<Promise<unknown>> = [];
  for (const [k, key] of Object.entries(SETTING_KEYS) as [Key, string][]) {
    if (!(k in input)) continue;
    const value = (input as Record<string, unknown>)[k];
    if (value === '' || value === null || value === undefined) {
      ops.push(prisma.setting.delete({ where: { key } }).catch(() => undefined));
    } else {
      ops.push(
        prisma.setting.upsert({
          where: { key },
          update: { value: value as object },
          create: { key, value: value as object, description: `Paymob: ${k}` },
        }),
      );
    }
  }
  await Promise.all(ops);
  cache = null; // bust cache so the next read sees the new values
  return getPaymobConfig(true);
}

export function invalidatePaymobConfigCache(): void {
  cache = null;
}
