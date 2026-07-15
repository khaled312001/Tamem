import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_BASE_URL: z.string().url().default('http://localhost:4000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_MAPS_API_KEY: z.string().optional(),

  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_BUSINESS_NUMBER: z.string().default('+201010254819'),

  FCM_SERVICE_ACCOUNT_JSON_PATH: z.string().optional(),

  // SMS provider — fallback for OTP when the user doesn't have WhatsApp.
  // Generic shape that works for Twilio, Vonage, MessageBird, Smsala, etc.
  // Leave URL/TOKEN empty to disable; OTP request will still succeed but
  // the channel will be "whatsapp-only".
  SMS_PROVIDER_URL: z.string().url().optional(),
  SMS_PROVIDER_TOKEN: z.string().optional(),
  SMS_SENDER: z.string().optional(),
  SMS_PROVIDER_TO_KEY: z.string().optional(),
  SMS_PROVIDER_BODY_KEY: z.string().optional(),

  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:4321'),

  UPLOAD_DIR: z.string().default('./uploads'),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(10_485_760),

  DRIVER_CASH_LIMIT: z.coerce.number().nonnegative().default(1000),

  // EasyKash — the single payment gateway used by Tamem.
  // Supports Vodafone Cash, InstaPay, Visa, MasterCard, and Meeza through
  // one hosted page; the customer picks the method on EasyKash's site.
  // Leave EASYKASH_API_KEY empty to disable online payments — cash on
  // delivery still works.
  EASYKASH_API_KEY: z.string().optional(),
  EASYKASH_HMAC_SECRET: z.string().optional(),
  /**
   * Comma-separated EasyKash payment-options enum, e.g. "2,3,4,5,6".
   * Empty / unset → falls back to the full set [2,3,4,5,6].
   */
  EASYKASH_PAYMENT_OPTIONS: z.string().optional(),
  /** The URL EasyKash redirects the customer to after they finish paying.
   *  Defaults to API_BASE_URL/redirects/payment which renders a simple
   *  closing-tab page. */
  EASYKASH_REDIRECT_URL: z.string().url().optional(),

  // ─── SMTP (Hostinger) ────────────────────────────────────────────────
  SMTP_HOST: z.string().default('smtp.hostinger.com'),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_SECURE: z.coerce.boolean().default(true),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('info@deliverytamem.com'),
  SMTP_REPLY_TO: z.string().optional(),

  // ─── Admin OTP ───────────────────────────────────────────────────────
  // Comma-separated list of emails that receive the admin login OTP.
  ADMIN_OTP_RECIPIENTS: z.string().default('info@deliverytamem.com,DeliveryTamemQift@gmail.com'),
  ADMIN_OTP_TTL_MINUTES: z.coerce.number().int().positive().default(5),
  ADMIN_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(6),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const adminOtpRecipients = env.ADMIN_OTP_RECIPIENTS.split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';
