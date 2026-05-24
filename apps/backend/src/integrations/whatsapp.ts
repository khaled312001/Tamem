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
