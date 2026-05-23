import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

interface WhatsAppTemplate {
  toPhone: string;
  text: string;
}

/**
 * Sends a WhatsApp message via Cloud API.
 * Gracefully no-ops if credentials aren't configured — Phase 1 uses
 * mobile deep-links as the primary path; this is the optional server-side dispatch.
 */
export async function sendWhatsAppMessage({ toPhone, text }: WhatsAppTemplate): Promise<boolean> {
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
