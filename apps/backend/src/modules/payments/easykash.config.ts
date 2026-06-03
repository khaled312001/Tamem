/**
 * EasyKash runtime configuration.
 *
 * Settings are stored in the DB so the admin can rotate them from the
 * dashboard without redeploy. Process env vars are the fallback used by
 * CI / first boot when no Setting row exists yet.
 *
 * The values cached in memory for 30s to avoid hammering the DB on every
 * webhook (EasyKash can replay 5+ callbacks for the same transaction).
 */
import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';

const SETTING_KEYS = {
  apiKey: 'easykash_api_key',
  hmacSecret: 'easykash_hmac_secret',
  paymentOptions: 'easykash_payment_options',
} as const;

type Key = keyof typeof SETTING_KEYS;

export interface EasyKashConfig {
  apiKey?: string;
  hmacSecret?: string;
  /**
   * EasyKash payment-options enum. From the docs example:
   *   `paymentOptions: [2, 3, 4, 5, 6]`
   * The customer picks one of these on the hosted page.
   * Defaults reflect the full set requested by Tamem:
   * Vodafone Cash, InstaPay, Visa, MasterCard, Meeza.
   */
  paymentOptions: number[];
}

const DEFAULT_PAYMENT_OPTIONS = [2, 3, 4, 5, 6];

let cache: { value: EasyKashConfig; expires: number } | null = null;

function asString(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined;
  if (typeof v === 'number') return String(v);
  return undefined;
}

function asNumberArray(v: unknown): number[] | undefined {
  if (Array.isArray(v)) {
    const nums = v.map(Number).filter((n) => Number.isInteger(n) && n > 0);
    return nums.length ? nums : undefined;
  }
  if (typeof v === 'string') {
    const nums = v
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    return nums.length ? nums : undefined;
  }
  return undefined;
}

function parseEnvOptions(raw: string | undefined): number[] | undefined {
  return asNumberArray(raw);
}

export async function getEasyKashConfig(force = false): Promise<EasyKashConfig> {
  if (!force && cache && cache.expires > Date.now()) return cache.value;

  const rows = await prisma.setting.findMany({
    where: { key: { in: Object.values(SETTING_KEYS) } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));

  const value: EasyKashConfig = {
    apiKey: asString(byKey.get(SETTING_KEYS.apiKey)) ?? env.EASYKASH_API_KEY,
    hmacSecret: asString(byKey.get(SETTING_KEYS.hmacSecret)) ?? env.EASYKASH_HMAC_SECRET,
    paymentOptions:
      asNumberArray(byKey.get(SETTING_KEYS.paymentOptions)) ??
      parseEnvOptions(env.EASYKASH_PAYMENT_OPTIONS) ??
      DEFAULT_PAYMENT_OPTIONS,
  };

  cache = { value, expires: Date.now() + 30_000 };
  return value;
}

export async function setEasyKashConfig(
  input: Partial<
    Pick<EasyKashConfig, 'apiKey' | 'hmacSecret'> & { paymentOptions: number[] | string }
  >,
): Promise<EasyKashConfig> {
  const ops: Array<Promise<unknown>> = [];
  for (const k of Object.keys(input) as Key[]) {
    const key = SETTING_KEYS[k];
    if (!key) continue;
    const value = (input as Record<string, unknown>)[k];
    if (value === '' || value === null || value === undefined) {
      ops.push(prisma.setting.delete({ where: { key } }).catch(() => undefined));
    } else {
      // For paymentOptions we always persist a JSON number[] so the form
      // round-trip stays type-stable across dashboard reloads.
      const payload: unknown = k === 'paymentOptions' ? (asNumberArray(value) ?? []) : value;
      ops.push(
        prisma.setting.upsert({
          where: { key },
          update: { value: payload as object },
          create: { key, value: payload as object, description: `EasyKash: ${k}` },
        }),
      );
    }
  }
  await Promise.all(ops);
  cache = null;
  return getEasyKashConfig(true);
}

export function invalidateEasyKashConfigCache(): void {
  cache = null;
}
