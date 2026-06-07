/**
 * Product sync engine — fetches a merchant's external product feed,
 * applies field mapping, and upserts into the Product table.
 *
 * Three independent stages:
 *   1. fetchFeed(config)       → raw JSON from the merchant's API
 *   2. extractItems(payload)   → the products array (root or nested)
 *   3. mapAndUpsert(merchant)  → resolve fields, insert/update by SKU
 *
 * Each call returns a structured result so the caller (manual sync vs.
 * cron) can log + display counts uniformly.
 */
import type { MerchantApiConfig } from '@prisma/client';

import { prisma } from '../../db/prisma.js';
import { decryptSecret } from '../../utils/crypto.js';
import { logger } from '../../utils/logger.js';

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB hard cap

export interface SyncResult {
  ok: boolean;
  fetchedCount: number;
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  hiddenCount: number;
  error?: string;
  /** Sample of the first 3 items, used by the dashboard mapping preview. */
  sampleItems?: unknown[];
  /** All the leaf field paths discovered in the first item. */
  sampleFields?: string[];
}

export interface FieldMapping {
  // Each destination field can come from any source path. Empty → not mapped.
  nameAr?: string;
  name?: string;
  description?: string;
  price?: string;
  salePrice?: string;
  imageUrl?: string;
  imageUrls?: string;
  categoryName?: string;
  stock?: string;
  isAvailable?: string;
  sku?: string;
  externalId?: string;
  barcode?: string;
  weight?: string;
}

const DEFAULT_MAPPING: FieldMapping = {
  // Common synonyms — covers most APIs out of the box.
  nameAr: 'nameAr',
  name: 'name',
  description: 'description',
  price: 'price',
  salePrice: 'sale_price',
  imageUrl: 'image',
  imageUrls: 'images',
  categoryName: 'category',
  stock: 'stock',
  isAvailable: 'available',
  sku: 'sku',
  externalId: 'id',
  barcode: 'barcode',
  weight: 'weight',
};

// ─────────────────────────────────────────────────────────────────────────
// Stage 1: fetch
// ─────────────────────────────────────────────────────────────────────────

/**
 * Block obviously-internal IPs so a misconfigured/malicious merchant URL
 * can't pivot us into our own infrastructure. We only block the most
 * common forms (loopback, link-local, private nets, metadata server) —
 * a determined attacker can still bypass via DNS rebinding etc.
 */
function isUrlSafe(rawUrl: string): { ok: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'رابط API غير صحيح' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, reason: 'الرابط يجب أن يبدأ بـ http:// أو https://' };
  }
  const host = parsed.hostname;
  const BLOCKED = [
    /^127\./,
    /^0\./,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^169\.254\./,
    /^::1$/,
    /^fe80:/i,
    /^localhost$/i,
    /^.*\.local$/i,
  ];
  if (BLOCKED.some((re) => re.test(host))) {
    return { ok: false, reason: 'لا يمكن استخدام عنوان داخلي' };
  }
  return { ok: true };
}

/** Build the auth + extra headers for the outgoing request. */
function buildHeaders(config: MerchantApiConfig): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'Tamem-ProductSync/1.0',
  };
  if (config.extraHeaders && typeof config.extraHeaders === 'object') {
    for (const [k, v] of Object.entries(config.extraHeaders as Record<string, unknown>)) {
      if (typeof v === 'string') headers[k] = v;
    }
  }
  const token = config.tokenSecret ? decryptSecret(config.tokenSecret) : '';
  if (token) {
    if (config.authType === 'BEARER') {
      headers.Authorization = `Bearer ${token}`;
    } else if (config.authType === 'BASIC') {
      headers.Authorization = `Basic ${Buffer.from(token).toString('base64')}`;
    } else if (config.authType === 'API_KEY') {
      const name = config.authHeaderName || 'X-API-Key';
      headers[name] = token;
    }
  }
  return headers;
}

/** Fetch the raw payload with timeout + size guard. */
export async function fetchFeed(config: MerchantApiConfig): Promise<unknown> {
  const safety = isUrlSafe(config.apiUrl);
  if (!safety.ok) throw new Error(safety.reason);

  const headers = buildHeaders(config);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const init: RequestInit = {
      method: config.method,
      headers,
      signal: controller.signal,
    };
    if (config.method === 'POST' && config.requestBody) {
      init.body = JSON.stringify(config.requestBody);
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(config.apiUrl, init);
    if (!res.ok) {
      throw new Error(`فشل الاتصال — رد الخادم بحالة ${res.status}`);
    }
    const reader = res.body?.getReader();
    if (!reader) {
      // No streaming — small response, take whole thing.
      const text = await res.text();
      if (text.length > MAX_RESPONSE_BYTES) {
        throw new Error('الاستجابة كبيرة جداً');
      }
      return JSON.parse(text);
    }
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        received += value.byteLength;
        if (received > MAX_RESPONSE_BYTES) {
          throw new Error('الاستجابة كبيرة جداً');
        }
        chunks.push(value);
      }
    }
    const body = Buffer.concat(chunks).toString('utf8');
    return JSON.parse(body);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('انتهت مهلة الاتصال بسيرفر التاجر');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Stage 2: locate the products array
// ─────────────────────────────────────────────────────────────────────────

/** Resolve a dot-path inside an object — `result.products` → obj.result.products. */
function resolvePath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

/**
 * Walk the response looking for the products array. If admin supplied
 * `productsPath` we honor it; otherwise we try the common conventions in
 * order so most APIs Just Work without configuration.
 */
export function extractItems(payload: unknown, productsPath: string | null): unknown[] {
  if (productsPath) {
    const v = resolvePath(payload, productsPath);
    if (Array.isArray(v)) return v;
    throw new Error(`المسار "${productsPath}" لا يحتوي على مصفوفة منتجات`);
  }
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    for (const key of ['products', 'data', 'items', 'results']) {
      if (Array.isArray(p[key])) return p[key] as unknown[];
    }
    // result.products
    if (
      p.result &&
      typeof p.result === 'object' &&
      Array.isArray((p.result as Record<string, unknown>).products)
    ) {
      return (p.result as Record<string, unknown>).products as unknown[];
    }
  }
  throw new Error('لم يتم العثور على قائمة منتجات في الاستجابة');
}

/** Flatten an object to dot-path leaf fields — used by the dashboard preview. */
export function listLeafFields(obj: unknown, prefix = '', out: Set<string> = new Set()): string[] {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    out.add(prefix);
    return Array.from(out);
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      listLeafFields(v, path, out);
    } else {
      out.add(path);
    }
  }
  return Array.from(out).sort();
}

// ─────────────────────────────────────────────────────────────────────────
// Stage 3: map + upsert
// ─────────────────────────────────────────────────────────────────────────

function pickString(item: Record<string, unknown>, path: string | undefined): string | undefined {
  if (!path) return undefined;
  const v = resolvePath(item, path);
  if (v == null) return undefined;
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}

function pickNumber(item: Record<string, unknown>, path: string | undefined): number | undefined {
  if (!path) return undefined;
  const v = resolvePath(item, path);
  if (v == null) return undefined;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function pickBool(item: Record<string, unknown>, path: string | undefined): boolean | undefined {
  if (!path) return undefined;
  const v = resolvePath(item, path);
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.toLowerCase().trim();
    if (['true', '1', 'yes', 'available'].includes(s)) return true;
    if (['false', '0', 'no', 'unavailable'].includes(s)) return false;
  }
  return undefined;
}

function pickStringArray(
  item: Record<string, unknown>,
  path: string | undefined,
): string[] | undefined {
  if (!path) return undefined;
  const v = resolvePath(item, path);
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string') return [v];
  return undefined;
}

/** Basic XSS guard for free-text fields harvested from external APIs. */
function sanitize(s: string | undefined, max = 500): string | undefined {
  if (!s) return s;
  // Strip script-ish chars + cap length.
  return s
    .replace(/<\/?script[^>]*>/gi, '')
    .replace(/<[^>]+on\w+=/gi, '<')
    .slice(0, max)
    .trim();
}

/**
 * Resolve mapping + upsert against the Product table. Updates by:
 *   1. (merchantId, sku) when sku present  → unique index already
 *   2. (merchantId, externalId) when sku absent — secondary index
 *   3. Otherwise insert as new (a sync should rarely land here — we warn).
 *
 * Returns counts and the list of (merchant, sku|externalId) keys touched,
 * so the caller can apply the `missingPolicy` to anything left behind.
 */
export async function mapAndUpsert(
  merchantId: string,
  items: unknown[],
  mappingJson: unknown,
): Promise<{
  fetchedCount: number;
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  seenKeys: Array<{ sku?: string; externalId?: string }>;
}> {
  const mapping: FieldMapping = {
    ...DEFAULT_MAPPING,
    ...((mappingJson as FieldMapping | null) ?? {}),
  };

  let created = 0;
  let updated = 0;
  let failed = 0;
  const seenKeys: Array<{ sku?: string; externalId?: string }> = [];

  // Look up the merchant's category for new products — we don't auto-create
  // top-level categories here; products inherit the merchant's category.
  const merchant = await prisma.merchantProfile.findUnique({
    where: { id: merchantId },
    select: { id: true },
  });
  if (!merchant) throw new Error('Merchant not found');

  for (const raw of items) {
    if (!raw || typeof raw !== 'object') {
      failed++;
      continue;
    }
    const item = raw as Record<string, unknown>;
    try {
      const sku = sanitize(pickString(item, mapping.sku), 80);
      const externalId = sanitize(pickString(item, mapping.externalId), 120);
      const nameAr =
        sanitize(pickString(item, mapping.nameAr), 200) ||
        sanitize(pickString(item, mapping.name), 200);
      const name = sanitize(pickString(item, mapping.name), 200) || nameAr;
      const description = sanitize(pickString(item, mapping.description), 2000);
      const price = pickNumber(item, mapping.price);
      const salePrice = pickNumber(item, mapping.salePrice);
      const imageUrl = sanitize(pickString(item, mapping.imageUrl), 500);
      const imageUrls = pickStringArray(item, mapping.imageUrls);
      const categoryName = sanitize(pickString(item, mapping.categoryName), 120);
      const stock = pickNumber(item, mapping.stock);
      const explicitAvail = pickBool(item, mapping.isAvailable);
      const barcode = sanitize(pickString(item, mapping.barcode), 80);
      const weight = pickNumber(item, mapping.weight);

      if (!nameAr || price == null) {
        failed++;
        continue;
      }

      // Availability: explicit boolean wins; else stock>0 means available;
      // else default to true.
      const isAvailable = explicitAvail != null ? explicitAvail : stock != null ? stock > 0 : true;

      const data = {
        merchantId,
        name: name ?? nameAr,
        nameAr,
        description: description ?? null,
        imageUrl: imageUrl ?? null,
        imageUrls: imageUrls ?? undefined,
        price,
        salePrice: salePrice ?? null,
        categoryName: categoryName ?? null,
        stock: stock ?? null,
        isAvailable,
        sku: sku ?? null,
        externalId: externalId ?? null,
        barcode: barcode ?? null,
        weight: weight ?? null,
        lastSyncedAt: new Date(),
        isHidden: false,
      };

      // Pick the upsert strategy by which identifier is present.
      if (sku) {
        const existing = await prisma.product.findUnique({
          where: { merchantId_sku: { merchantId, sku } },
          select: { id: true },
        });
        if (existing) {
          await prisma.product.update({ where: { id: existing.id }, data });
          updated++;
        } else {
          await prisma.product.create({ data });
          created++;
        }
        seenKeys.push({ sku });
      } else if (externalId) {
        const existing = await prisma.product.findFirst({
          where: { merchantId, externalId },
          select: { id: true },
        });
        if (existing) {
          await prisma.product.update({ where: { id: existing.id }, data });
          updated++;
        } else {
          await prisma.product.create({ data });
          created++;
        }
        seenKeys.push({ externalId });
      } else {
        // No stable ID at all — match by name to avoid duplicates.
        const existing = await prisma.product.findFirst({
          where: { merchantId, nameAr, sku: null, externalId: null },
          select: { id: true },
        });
        if (existing) {
          await prisma.product.update({ where: { id: existing.id }, data });
          updated++;
        } else {
          await prisma.product.create({ data });
          created++;
        }
      }
    } catch (err) {
      logger.warn({ err }, 'product upsert failed');
      failed++;
    }
  }

  return {
    fetchedCount: items.length,
    createdCount: created,
    updatedCount: updated,
    failedCount: failed,
    seenKeys,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// End-to-end orchestration
// ─────────────────────────────────────────────────────────────────────────

/** Test connection + return sample data + leaf field list (no DB writes). */
export async function testConnection(config: MerchantApiConfig): Promise<SyncResult> {
  try {
    const payload = await fetchFeed(config);
    const items = extractItems(payload, config.productsPath ?? null);
    const sampleItems = items.slice(0, 3);
    const sampleFields = sampleItems.length > 0 ? listLeafFields(sampleItems[0]) : [];
    return {
      ok: true,
      fetchedCount: items.length,
      createdCount: 0,
      updatedCount: 0,
      failedCount: 0,
      hiddenCount: 0,
      sampleItems,
      sampleFields,
    };
  } catch (err) {
    return {
      ok: false,
      fetchedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      failedCount: 0,
      hiddenCount: 0,
      error: err instanceof Error ? err.message : 'فشل الاتصال',
    };
  }
}

/** Full sync — fetch + map + upsert + apply missing-policy. */
export async function runSync(
  config: MerchantApiConfig,
  options: { trigger: 'MANUAL' | 'AUTO' | 'WEBHOOK'; triggeredById?: string },
): Promise<SyncResult> {
  const logRow = await prisma.productSyncLog.create({
    data: {
      configId: config.id,
      merchantId: config.merchantId,
      trigger: options.trigger,
      triggeredById: options.triggeredById,
      status: 'RUNNING',
    },
  });

  try {
    const payload = await fetchFeed(config);
    const items = extractItems(payload, config.productsPath ?? null);
    const upserts = await mapAndUpsert(config.merchantId, items, config.fieldMapping);

    // Apply the missing-product policy to anything previously synced from
    // this merchant that didn't show up this run.
    let hidden = 0;
    if (
      (config.missingPolicy === 'MARK_UNAVAILABLE' ||
        config.missingPolicy === 'HIDE' ||
        config.missingPolicy === 'DELETE') &&
      upserts.seenKeys.length > 0
    ) {
      const seenSkus = upserts.seenKeys.map((k) => k.sku).filter((s): s is string => !!s);
      const seenExt = upserts.seenKeys.map((k) => k.externalId).filter((s): s is string => !!s);
      const missing = await prisma.product.findMany({
        where: {
          merchantId: config.merchantId,
          lastSyncedAt: { lt: logRow.startedAt },
          ...(seenSkus.length > 0 ? { NOT: { sku: { in: seenSkus } } } : {}),
        },
        select: { id: true, externalId: true },
      });
      const reallyMissing = missing.filter((m) => !m.externalId || !seenExt.includes(m.externalId));

      if (reallyMissing.length > 0) {
        if (config.missingPolicy === 'DELETE') {
          await prisma.product.deleteMany({
            where: { id: { in: reallyMissing.map((m) => m.id) } },
          });
          hidden = reallyMissing.length;
        } else {
          await prisma.product.updateMany({
            where: { id: { in: reallyMissing.map((m) => m.id) } },
            data:
              config.missingPolicy === 'HIDE'
                ? { isHidden: true, isAvailable: false }
                : { isAvailable: false },
          });
          hidden = reallyMissing.length;
        }
      }
    }

    const status = upserts.failedCount > 0 ? 'PARTIAL' : 'SUCCESS';
    await prisma.productSyncLog.update({
      where: { id: logRow.id },
      data: {
        finishedAt: new Date(),
        status,
        fetchedCount: upserts.fetchedCount,
        createdCount: upserts.createdCount,
        updatedCount: upserts.updatedCount,
        failedCount: upserts.failedCount,
        hiddenCount: hidden,
      },
    });
    await prisma.merchantApiConfig.update({
      where: { id: config.id },
      data: {
        isConnected: true,
        lastError: null,
        lastSyncedAt: new Date(),
        nextSyncAt: nextSyncAfter(config.syncInterval),
      },
    });
    return {
      ok: true,
      fetchedCount: upserts.fetchedCount,
      createdCount: upserts.createdCount,
      updatedCount: upserts.updatedCount,
      failedCount: upserts.failedCount,
      hiddenCount: hidden,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'فشل المزامنة';
    await prisma.productSyncLog.update({
      where: { id: logRow.id },
      data: {
        finishedAt: new Date(),
        status: 'FAILED',
        errorMessage: message.slice(0, 500),
      },
    });
    await prisma.merchantApiConfig.update({
      where: { id: config.id },
      data: { isConnected: false, lastError: message.slice(0, 500) },
    });
    return {
      ok: false,
      fetchedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      failedCount: 0,
      hiddenCount: 0,
      error: message,
    };
  }
}

/** Compute the next `nextSyncAt` based on the interval. */
export function nextSyncAfter(interval: MerchantApiConfig['syncInterval']): Date | null {
  const now = Date.now();
  switch (interval) {
    case 'EVERY_15_MIN':
      return new Date(now + 15 * 60_000);
    case 'EVERY_30_MIN':
      return new Date(now + 30 * 60_000);
    case 'HOURLY':
      return new Date(now + 60 * 60_000);
    case 'DAILY':
      return new Date(now + 24 * 60 * 60_000);
    case 'DISABLED':
    default:
      return null;
  }
}
