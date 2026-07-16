/**
 * SMTP mail helper — sends transactional email via nodemailer.
 *
 * Configured for Hostinger (smtp.hostinger.com:465, SSL) by default but the
 * host/port/user/password all come from env so any SMTP provider works.
 *
 * Silently no-ops (with a warn log) when SMTP_USER isn't configured, so the
 * app still boots and non-email code paths (e.g. WhatsApp OTP) keep working.
 */
import nodemailer, { type Transporter } from 'nodemailer';

import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let cached: Transporter | null = null;

function getTransport(): Transporter | null {
  if (cached) return cached;
  if (!env.SMTP_USER || !env.SMTP_PASSWORD) {
    logger.warn('[mail] SMTP credentials missing — emails will be skipped');
    return null;
  }
  cached = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  });
  return cached;
}

export interface MailInput {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

/**
 * Send an email. Returns true if actually sent, false if SMTP wasn't configured.
 * Throws on real send failures (bad credentials, network, rejected recipient).
 */
export async function sendMail(input: MailInput): Promise<boolean> {
  const t = getTransport();
  if (!t) return false;
  await t.sendMail({
    from: env.SMTP_FROM,
    replyTo: env.SMTP_REPLY_TO,
    to: Array.isArray(input.to) ? input.to.join(', ') : input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
  return true;
}
