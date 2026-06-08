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

/**
 * Built when the admin assigns a driver to an order. Includes everything
 * the driver needs to start the pickup: addresses (with Google Maps
 * links), customer contact, items / free-text description, attached
 * images, and the total to collect on COD.
 */
export function buildDriverAssignmentText(opts: {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  serviceNameAr: string;
  notes?: string | null;
  paymentMethodAr?: string | null;
  total?: number | null;
  pickupAddress?: string | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  deliveryAddress?: string | null;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  items?: Array<{ name: string; quantity: number }>;
  /** Free-text fields the customer filled (quick orders / dynamic forms). */
  customData?: Record<string, unknown> | null;
  /** Hosted image URLs uploaded on the order (separate from customData). */
  imageUrls?: string[] | null;
}): string {
  const mapsLink = (lat?: number | null, lng?: number | null): string | null =>
    lat != null && lng != null ? `https://maps.google.com/?q=${lat},${lng}` : null;
  const pickupMap = mapsLink(opts.pickupLat, opts.pickupLng);
  const deliveryMap = mapsLink(opts.deliveryLat, opts.deliveryLng);

  const lines: Array<string | false> = [
    `🚚 تم تعيينك لطلب جديد ${opts.orderNumber}`,
    '',
    `📦 الخدمة: ${opts.serviceNameAr}`,
    `👤 العميل: ${opts.customerName}`,
    `📞 رقمه: ${opts.customerPhone}`,
    '',
  ];

  // Catalog items (cart checkout) — printed when present.
  if (opts.items && opts.items.length > 0) {
    lines.push('🛒 المنتجات:');
    for (const it of opts.items) lines.push(`  • ${it.name} ×${it.quantity}`);
    lines.push('');
  }

  // Free-text customer description + any other dynamic form fields.
  // Quick orders ("اطلب أي حاجة") live entirely inside customData, so
  // skipping this would send the driver an empty brief.
  const imageUrlsFromCustom: string[] = [];
  if (opts.customData && typeof opts.customData === 'object') {
    for (const [key, raw] of Object.entries(opts.customData)) {
      if (raw == null) continue;
      // Collect image arrays for the dedicated section below.
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
      const label = CUSTOM_DATA_LABELS[key];
      if (!label) continue; // skip technical keys (deliveryLat/Lng/etc)
      const value =
        typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean'
          ? String(raw).trim()
          : Array.isArray(raw)
            ? raw.join('، ')
            : '';
      if (value) lines.push(`📝 ${label}: ${value}`);
    }
    if (lines[lines.length - 1] !== '') lines.push('');
  }

  if (opts.pickupAddress) {
    lines.push('📍 الاستلام من:');
    lines.push(opts.pickupAddress);
    if (pickupMap) lines.push(pickupMap);
    lines.push('');
  }
  if (opts.deliveryAddress) {
    lines.push('🏠 التوصيل إلى:');
    lines.push(opts.deliveryAddress);
    if (deliveryMap) lines.push(deliveryMap);
    lines.push('');
  }

  if (opts.notes) {
    lines.push(`📝 ملاحظات إضافية: ${opts.notes}`);
    lines.push('');
  }

  // Photos — combined: explicit order.imageUrls + ones lifted from
  // customData. Dedup so the same image never appears twice.
  const allImages = Array.from(
    new Set([...(opts.imageUrls ?? []), ...imageUrlsFromCustom].filter(Boolean)),
  );
  if (allImages.length > 0) {
    lines.push(`📷 الصور المرفقة (${allImages.length}):`);
    for (const url of allImages) lines.push(url);
    lines.push('');
  }

  if (opts.paymentMethodAr) lines.push(`💳 الدفع: ${opts.paymentMethodAr}`);
  if (opts.total != null) lines.push(`💰 المبلغ المطلوب: ${opts.total} ج.م`);

  return lines.filter((l): l is string => typeof l === 'string').join('\n');
}
