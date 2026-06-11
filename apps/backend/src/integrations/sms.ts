/**
 * SMS dispatcher — generic shape that covers Twilio + Vonage + any other
 * provider exposing a REST endpoint that takes `{ to, message }`.
 *
 * Env contract:
 *   SMS_PROVIDER_URL       — POST endpoint
 *   SMS_PROVIDER_TOKEN     — Bearer token / API key
 *   SMS_SENDER             — From / sender ID (E.164 or short name)
 *   SMS_PROVIDER_BODY_KEY  — request field for the message body  (default: "message")
 *   SMS_PROVIDER_TO_KEY    — request field for the recipient    (default: "to")
 *
 * Returns true on success. Graceful no-op when the URL/token aren't
 * configured — caller can chain it as a fallback after WhatsApp without
 * special-casing the unconfigured case.
 *
 * This is the second OTP channel for users who don't have WhatsApp —
 * the auth controller tries WhatsApp first, then falls through to SMS.
 */
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

interface SmsInput {
  toPhone: string;
  text: string;
}

export function isSmsConfigured(): boolean {
  return Boolean(env.SMS_PROVIDER_URL && env.SMS_PROVIDER_TOKEN);
}

export async function sendSms({ toPhone, text }: SmsInput): Promise<boolean> {
  if (!isSmsConfigured()) {
    logger.debug({ toPhone }, 'SMS provider not configured — skipping');
    return false;
  }

  const cleanPhone = toPhone.replace(/[^\d+]/g, '');
  const toKey = env.SMS_PROVIDER_TO_KEY || 'to';
  const bodyKey = env.SMS_PROVIDER_BODY_KEY || 'message';
  const payload: Record<string, unknown> = {
    [toKey]: cleanPhone,
    [bodyKey]: text,
  };
  if (env.SMS_SENDER) payload.from = env.SMS_SENDER;

  try {
    const res = await fetch(env.SMS_PROVIDER_URL!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.SMS_PROVIDER_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = await res.text();
      logger.warn({ status: res.status, detail: detail.slice(0, 200) }, 'SMS send failed');
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err }, 'SMS dispatch threw');
    return false;
  }
}
