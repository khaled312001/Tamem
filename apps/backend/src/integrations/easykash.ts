/**
 * EasyKash Direct Payment integration.
 *
 * EasyKash is the single payment gateway used by Tamem (replaces Paymob).
 * One redirect URL handles all enabled methods: Vodafone Cash, InstaPay,
 * Visa, MasterCard, Meeza — the customer picks on the hosted page so we
 * keep the mobile UI to a single "ادفع الآن" button.
 *
 * Public docs: https://easykash.gitbook.io/easykash-apis-documentation
 *
 * Flow:
 *   1. POST {BASE}/api/directpayv1/pay  (Authorization: <apiKey>)
 *        body: { amount, currency:'EGP', paymentOptions:[…], name, email,
 *                mobile, redirectUrl, customerReference }
 *      → { redirectUrl: 'https://www.easykash.net/DirectPayV1/<productCode>' }
 *   2. Customer pays on EasyKash's page.
 *   3. EasyKash POSTs our webhook with `signatureHash` (SHA-512 HMAC) and
 *      transaction details — we verify the signature and update the order.
 *   4. EasyKash then redirects the customer to our `redirectUrl` with
 *      query params status / providerRefNum / customerReference / voucher.
 *
 * The HMAC signature concatenates the VALUES of these 7 fields in order:
 *   ProductCode  Amount  ProductType  PaymentMethod  status  easykashRef  customerReference
 * then SHA-512 with the HMAC secret and HEX digest.
 */
import crypto from 'node:crypto';

import { getEasyKashConfig } from '../modules/payments/easykash.config.js';
import { logger } from '../utils/logger.js';

const BASE = 'https://back.easykash.net';

export interface CheckoutInput {
  orderId: string; // our Order.id — passed as customerReference
  orderNumber: string;
  amountEgp: number;
  customer: {
    name: string;
    phone: string; // EG mobile, will be normalised to digits-only
    email?: string;
  };
  /** Where EasyKash redirects the customer AFTER they finish paying. */
  redirectUrl: string;
}

export interface CheckoutResult {
  /** Hosted EasyKash page URL — open this in WebBrowser / iframe. */
  redirectUrl: string;
}

interface CallbackPayload {
  ProductCode: string;
  PaymentMethod: string;
  ProductType: string;
  Amount: string;
  BuyerEmail?: string;
  BuyerMobile?: string;
  BuyerName?: string;
  Timestamp?: string;
  status: string; // PAID / FAILED / etc.
  voucher?: string;
  easykashRef: string;
  VoucherData?: string;
  customerReference: string;
  signatureHash: string;
}

export async function isEasyKashConfigured(): Promise<boolean> {
  const cfg = await getEasyKashConfig();
  return Boolean(cfg.apiKey && cfg.hmacSecret);
}

export async function startCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  const cfg = await getEasyKashConfig();
  if (!cfg.apiKey) {
    throw new Error('EasyKash API Key مش مضبوط — اضبطه من صفحة بوابة الدفع');
  }
  if (!cfg.paymentOptions.length) {
    throw new Error('لازم تختار طريقة دفع واحدة على الأقل من بوابة الدفع');
  }

  // EasyKash expects a digits-only Egyptian mobile (11 digits).
  const digitsOnly = input.customer.phone.replace(/\D/g, '');
  const mobile = digitsOnly.startsWith('20') ? `0${digitsOnly.slice(2)}` : digitsOnly;

  const res = await fetch(`${BASE}/api/directpayv1/pay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // EasyKash uses a bare API key in the `authorization` header — NOT
      // the "Bearer …" scheme. Sending Bearer makes the gateway respond
      // with a 401 even when the key is correct.
      authorization: cfg.apiKey,
    },
    body: JSON.stringify({
      amount: Number(input.amountEgp.toFixed(2)),
      currency: 'EGP',
      paymentOptions: cfg.paymentOptions,
      // 3 days for cash-style options (Fawry voucher etc.). Ignored by
      // wallets / cards but EasyKash requires it for cash methods.
      cashExpiry: 3,
      name: input.customer.name || 'Tamem Customer',
      email: input.customer.email ?? `${mobile}@tamem-delivery.com`,
      mobile,
      redirectUrl: input.redirectUrl,
      // Our Order.id round-trips as customerReference — we read it back
      // from the webhook to know which order to mark PAID.
      customerReference: input.orderId,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`EasyKash refused checkout: ${res.status} ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as { redirectUrl?: string };
  if (!data.redirectUrl) {
    throw new Error('EasyKash لم يرجع رابط الدفع');
  }

  logger.info(
    { orderId: input.orderId, redirectUrl: data.redirectUrl },
    'easykash checkout started',
  );
  return { redirectUrl: data.redirectUrl };
}

/**
 * Verify the SHA-512 HMAC EasyKash attaches to every callback as
 * `signatureHash`. The signed string is the concatenation of the VALUES
 * of these 7 fields, in this exact order:
 *
 *   ProductCode | Amount | ProductType | PaymentMethod | status |
 *   easykashRef | customerReference
 *
 * Returns true when verified or when the HMAC secret is not yet configured
 * (development mode only) — production must set the secret.
 */
export async function verifyCallbackSignature(payload: CallbackPayload): Promise<boolean> {
  const cfg = await getEasyKashConfig();
  if (!cfg.hmacSecret) {
    // Refuse to no-op in production. In dev we accept so the local mock
    // webhook can exercise the success path.
    if (process.env.NODE_ENV === 'production') {
      logger.error('EasyKash HMAC secret not configured in production — rejecting webhook');
      return false;
    }
    logger.warn('EasyKash HMAC secret not configured — accepting webhook unverified (dev only)');
    return true;
  }

  const concat = [
    payload.ProductCode,
    payload.Amount,
    payload.ProductType,
    payload.PaymentMethod,
    payload.status,
    payload.easykashRef,
    payload.customerReference,
  ]
    .map((v) => (v == null ? '' : String(v)))
    .join('');

  const expected = crypto.createHmac('sha512', cfg.hmacSecret).update(concat).digest('hex');

  try {
    // Use a constant-time comparison so timing attacks can't infer the
    // secret. Both buffers must be the same length or timingSafeEqual
    // throws — fail closed when the supplied hash is malformed.
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(payload.signatureHash, 'hex'),
    );
  } catch {
    return false;
  }
}

export type { CallbackPayload };
