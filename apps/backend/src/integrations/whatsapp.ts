import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

import * as wpp from './wppconnect.js';

interface WhatsAppTemplate {
  toPhone: string;
  text: string;
}

/**
 * Sends a WhatsApp message via — in this order of preference:
 *   1. WppConnect bridge (admin scanned the QR) — uses the admin's own WhatsApp,
 *      so the customer sees the real Tamem business number replying.
 *   2. WhatsApp Cloud API — when WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID
 *      are set, falls back to Meta's official API.
 * Returns true if either path delivered the message.
 */
export async function sendWhatsAppMessage({ toPhone, text }: WhatsAppTemplate): Promise<boolean> {
  // 1) WppConnect bridge — preferred when the admin has scanned the QR
  try {
    const sent = await wpp.sendText(toPhone, text);
    if (sent) return true;
  } catch (err) {
    logger.warn({ err, toPhone }, 'wppconnect send error');
  }

  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    logger.debug({ toPhone }, 'WhatsApp not configured — skipping server-side send');
    return false;
  }

  const cleanPhone = toPhone.replace(/[^\d]/g, '');
  const url = `https://graph.facebook.com/v18.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'text',
        text: { body: text },
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      logger.warn({ status: res.status, detail }, 'WhatsApp send failed');
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err }, 'WhatsApp send error');
    return false;
  }
}

export function buildOrderConfirmationText(opts: {
  orderNumber: string;
  serviceNameAr: string;
  customerName: string;
  estimatedPrice?: number;
}): string {
  return [
    `✓ تم استلام طلبك ${opts.orderNumber}`,
    '',
    `الخدمة: ${opts.serviceNameAr}`,
    `الاسم: ${opts.customerName}`,
    opts.estimatedPrice !== undefined ? `الإجمالي التقديري: ${opts.estimatedPrice} ج.م` : '',
    '',
    'سنتواصل معك قريباً.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Rich, professional order-details WhatsApp message.
 *
 * Single source of truth for both the customer's confirmation and the
 * driver's assignment brief — both audiences need the same data, only the
 * header line and a few footer hints differ. Sections appear only when
 * the underlying field is populated, so a quick voice-note order looks
 * just as clean as a 10-item cart checkout.
 *
 * Media URLs (images, audio) are dropped in as plain links — WhatsApp
 * automatically previews images and lets the user open audio in the
 * browser. The URLs come from the backend's /uploads handler so they're
 * absolute (env.API_BASE_URL prefixed).
 */
export type Audience = 'customer' | 'driver';

export interface OrderDetailsOpts {
  audience: Audience;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  serviceNameAr: string;
  notes?: string | null;
  paymentMethodAr?: string | null;
  /** Sum the recipient ultimately needs to know. */
  total?: number | null;
  pickupAddress?: string | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  deliveryAddress?: string | null;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  items?: Array<{
    name: string;
    quantity: number;
    price?: number | null;
    /** Optional merchant name for multi-merchant orders — when present,
     *  items are grouped by merchant under sub-headers. */
    merchantName?: string | null;
  }>;
  customData?: Record<string, unknown> | null;
  imageUrls?: string[] | null;
  /** Scheduled delivery time, if customer picked one. */
  scheduledFor?: string | Date | null;
}

export function buildOrderDetailsText(opts: OrderDetailsOpts): string {
  const mapsLink = (lat?: number | null, lng?: number | null): string | null =>
    lat != null && lng != null ? `https://maps.google.com/?q=${lat},${lng}` : null;
  const pickupMap = mapsLink(opts.pickupLat, opts.pickupLng);
  const deliveryMap = mapsLink(opts.deliveryLat, opts.deliveryLng);
  const divider = '━━━━━━━━━━━━━━━';

  const lines: string[] = [];

  // ── Header — distinct per audience ─────────────────────────────────
  if (opts.audience === 'driver') {
    lines.push(`🚚 *تعيين جديد لك*`);
    lines.push(`رقم الطلب: ${opts.orderNumber}`);
  } else {
    lines.push(`✅ *تم استلام طلبك*`);
    lines.push(`رقم الطلب: ${opts.orderNumber}`);
    lines.push(`عزيزنا ${opts.customerName}، شكراً لاختيارك تَميم 🙏`);
  }
  lines.push(divider);

  // ── Service / Customer block ───────────────────────────────────────
  lines.push(`📦 الخدمة: ${opts.serviceNameAr}`);
  if (opts.audience === 'driver') {
    lines.push(`👤 العميل: ${opts.customerName}`);
    lines.push(`📞 الرقم: ${opts.customerPhone}`);
  }
  if (opts.scheduledFor) {
    const when =
      opts.scheduledFor instanceof Date ? opts.scheduledFor : new Date(opts.scheduledFor);
    lines.push(
      `⏰ ميعاد التسليم: ${when.toLocaleString('ar-EG', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`,
    );
  }
  lines.push('');

  // ── Catalog items ──────────────────────────────────────────────────
  if (opts.items && opts.items.length > 0) {
    // Group by merchant name when present. Multi-merchant orders get a
    // sub-header per store so the driver knows where to pick up what.
    const merchantNames = Array.from(
      new Set(
        opts.items
          .map((i) => i.merchantName)
          .filter((x): x is string => typeof x === 'string' && x.length > 0),
      ),
    );
    const isMulti = merchantNames.length > 1;

    if (isMulti) {
      lines.push(`🛒 *المنتجات* (من ${merchantNames.length} متاجر):`);
      const byMerchant = new Map<string, typeof opts.items>();
      for (const it of opts.items) {
        const key = it.merchantName ?? '— غير محدد —';
        if (!byMerchant.has(key)) byMerchant.set(key, []);
        byMerchant.get(key)!.push(it);
      }
      for (const [name, list] of byMerchant) {
        lines.push(`  🏪 *${name}*`);
        for (const it of list) {
          const priceTag = it.price != null ? ` — ${it.price} ج.م` : '';
          lines.push(`    • ${it.name} ×${it.quantity}${priceTag}`);
        }
      }
    } else {
      lines.push('🛒 *المنتجات:*');
      for (const it of opts.items) {
        const priceTag = it.price != null ? ` — ${it.price} ج.م` : '';
        lines.push(`  • ${it.name} ×${it.quantity}${priceTag}`);
      }
    }
    lines.push('');
  }

  // ── customData: free-text description + media references ───────────
  const imageUrlsFromCustom: string[] = [];
  const audioUrls: string[] = [];
  const seenText = new Set<string>();
  if (opts.customData && typeof opts.customData === 'object') {
    for (const [key, raw] of Object.entries(opts.customData)) {
      if (raw == null) continue;
      // Audio
      if (
        (key === 'audioUri' || key === 'audio' || key === 'voice' || key === 'voiceNote') &&
        typeof raw === 'string' &&
        raw.length > 0
      ) {
        audioUrls.push(raw);
        continue;
      }
      // Images (array)
      if (
        (key === 'attachment' ||
          key === 'attachments' ||
          key === 'images' ||
          key === 'imageUrls') &&
        Array.isArray(raw)
      ) {
        for (const u of raw) if (typeof u === 'string' && u) imageUrlsFromCustom.push(u);
        continue;
      }
      // Labelled text
      const label = CUSTOM_DATA_LABELS[key];
      if (!label) continue;
      const value =
        typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean'
          ? String(raw).trim()
          : Array.isArray(raw)
            ? raw.filter((x) => typeof x === 'string').join('، ')
            : '';
      if (value && !seenText.has(value)) {
        seenText.add(value);
        lines.push(`📝 *${label}:* ${value}`);
      }
    }
    if (lines[lines.length - 1] !== '') lines.push('');
  }

  // ── Addresses ──────────────────────────────────────────────────────
  if (opts.pickupAddress) {
    lines.push('📍 *الاستلام من:*');
    lines.push(opts.pickupAddress);
    if (pickupMap) lines.push(pickupMap);
    lines.push('');
  }
  if (opts.deliveryAddress) {
    lines.push(opts.audience === 'driver' ? '🏠 *التوصيل إلى:*' : '🏠 *عنوان التوصيل:*');
    lines.push(opts.deliveryAddress);
    if (deliveryMap) lines.push(deliveryMap);
    lines.push('');
  }

  // ── Notes ──────────────────────────────────────────────────────────
  if (opts.notes && opts.notes.trim()) {
    lines.push(`📝 *ملاحظات إضافية:* ${opts.notes.trim()}`);
    lines.push('');
  }

  // ── Media — voice notes and photos ─────────────────────────────────
  if (audioUrls.length > 0) {
    lines.push(`🎙️ *تسجيل صوتي:*`);
    for (const u of audioUrls) lines.push(u);
    lines.push('');
  }
  const allImages = Array.from(
    new Set([...(opts.imageUrls ?? []), ...imageUrlsFromCustom].filter(Boolean)),
  );
  if (allImages.length > 0) {
    lines.push(`📷 *الصور المرفقة (${allImages.length}):*`);
    for (const url of allImages) lines.push(url);
    lines.push('');
  }

  // ── Payment / total ────────────────────────────────────────────────
  if (opts.paymentMethodAr || opts.total != null) {
    lines.push(divider);
    if (opts.paymentMethodAr) lines.push(`💳 طريقة الدفع: ${opts.paymentMethodAr}`);
    if (opts.total != null) {
      const label = opts.audience === 'driver' ? '💰 المبلغ المطلوب تحصيله' : '💰 الإجمالي';
      lines.push(`${label}: ${opts.total} ج.م`);
    }
    lines.push('');
  }

  // ── Footer ────────────────────────────────────────────────────────
  if (opts.audience === 'customer') {
    lines.push('سنتواصل معك فور بدء التنفيذ. تَميم — التوصيل لعبتنا 🛵');
  }

  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * @deprecated Use buildOrderDetailsText({ audience: 'driver', ... }) instead.
 * Kept as a thin wrapper so legacy callers (orders.admin.controller) keep
 * working without a sweeping change.
 */
export function buildDriverAssignmentText(opts: Omit<OrderDetailsOpts, 'audience'>): string {
  return buildOrderDetailsText({ ...opts, audience: 'driver' });
}

/**
 * Field labels we surface from the order's free-text `customData` blob.
 * Quick orders ("اطلب أي حاجة") write whatever the customer typed into
 * `order_text` / `details` / `notes`, and uploaded photos into `attachment`
 * or `images`. The driver needs to see all of that on WhatsApp so we map
 * those keys → Arabic labels here.
 */
const CUSTOM_DATA_LABELS: Record<string, string> = {
  order_text: 'وصف الطلب',
  details: 'وصف الطلب',
  description: 'وصف الطلب',
  notes: 'ملاحظات',
  weight: 'الوزن',
  size: 'الحجم',
  fragile: 'هش / قابل للكسر',
};
