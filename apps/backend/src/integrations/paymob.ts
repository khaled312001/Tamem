/**
 * Paymob (formerly Accept) integration — the Egyptian payment gateway that
 * powers Vodafone Cash, InstaPay, and card payments.
 *
 * This is the Node.js equivalent of what Nafezly's Python package wraps. We
 * call the same Paymob Accept API directly so the result is identical without
 * needing a Python service.
 *
 * Flow (3 server hops + 1 redirect):
 *   1. POST /auth/tokens   → exchange API_KEY for an auth_token
 *   2. POST /ecommerce/orders → register the merchant_order and get an order_id
 *   3. POST /acceptance/payment_keys → get a payment_token for a specific
 *      integration (CARD / WALLET / INSTAPAY)
 *   4. Redirect the customer:
 *       - Card: https://accept.paymob.com/api/acceptance/iframes/{IFRAME_ID}?payment_token={t}
 *       - Wallet (Vodafone Cash): POST /acceptance/payments/pay {source: {identifier: <wallet#>, subtype: 'WALLET'}}
 *       - InstaPay: redirect to acceptance iframe with the InstaPay integration
 *   5. Paymob calls our webhook (HMAC-signed) with the result.
 *
 * Reference: https://docs.paymob.com/docs/accept-standard-redirect
 */
import crypto from 'node:crypto';

import { getPaymobConfig } from '../modules/payments/paymob.config.js';
import { logger } from '../utils/logger.js';

const BASE = 'https://accept.paymob.com/api';

// Only the two methods the customer cares about — wallet (Vodafone Cash) and InstaPay.
// Card support is intentionally excluded for now per product decision.
export type PaymentMethod = 'WALLET' | 'INSTAPAY';

export interface CheckoutInput {
  orderId: string;
  orderNumber: string;
  amountEgp: number; // major units (EGP) — converted to piastres internally
  method: PaymentMethod;
  customer: {
    name: string;
    phone: string;
    email?: string;
  };
  /** Wallet number for Vodafone Cash payments */
  walletNumber?: string;
}

export interface CheckoutResult {
  redirectUrl: string;
  paymobOrderId: number;
  paymentToken: string;
}

export async function isPaymobConfigured(): Promise<boolean> {
  const cfg = await getPaymobConfig();
  return Boolean(cfg.apiKey && (cfg.walletIntegrationId || cfg.instapayIntegrationId));
}

async function pickIntegration(method: PaymentMethod): Promise<number> {
  const cfg = await getPaymobConfig();
  switch (method) {
    case 'WALLET':
      if (!cfg.walletIntegrationId)
        throw new Error('Wallet Integration ID مش مضبوط — اضبطه من صفحة بوابة الدفع');
      return cfg.walletIntegrationId;
    case 'INSTAPAY':
      if (!cfg.instapayIntegrationId)
        throw new Error('InstaPay Integration ID مش مضبوط — اضبطه من صفحة بوابة الدفع');
      return cfg.instapayIntegrationId;
  }
}

async function auth(): Promise<string> {
  const cfg = await getPaymobConfig();
  if (!cfg.apiKey) throw new Error('Paymob API Key مش مضبوط — اضبطه من صفحة بوابة الدفع');
  const res = await fetch(`${BASE}/auth/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: cfg.apiKey }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Paymob auth failed: ${res.status} ${detail}`);
  }
  const data = (await res.json()) as { token: string };
  return data.token;
}

async function registerOrder(authToken: string, input: CheckoutInput): Promise<number> {
  const res = await fetch(`${BASE}/ecommerce/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_token: authToken,
      delivery_needed: 'false',
      amount_cents: Math.round(input.amountEgp * 100),
      currency: 'EGP',
      merchant_order_id: input.orderId,
      items: [
        {
          name: `Tamem Order ${input.orderNumber}`,
          amount_cents: Math.round(input.amountEgp * 100),
          quantity: 1,
        },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Paymob registerOrder failed: ${res.status} ${detail}`);
  }
  const data = (await res.json()) as { id: number };
  return data.id;
}

async function getPaymentKey(
  authToken: string,
  paymobOrderId: number,
  input: CheckoutInput,
  integrationId: number,
): Promise<string> {
  const [first, ...rest] = input.customer.name.trim().split(/\s+/);
  const lastName = rest.length ? rest.join(' ') : '-';
  const res = await fetch(`${BASE}/acceptance/payment_keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_token: authToken,
      amount_cents: Math.round(input.amountEgp * 100),
      expiration: 3600,
      order_id: paymobOrderId,
      billing_data: {
        first_name: first || 'Customer',
        last_name: lastName,
        email: input.customer.email ?? 'customer@tamem-delivery.com',
        phone_number: input.customer.phone,
        country: 'EG',
        city: 'Qift',
        street: '-',
        building: '-',
        floor: '-',
        apartment: '-',
      },
      currency: 'EGP',
      integration_id: integrationId,
      lock_order_when_paid: 'true',
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Paymob getPaymentKey failed: ${res.status} ${detail}`);
  }
  const data = (await res.json()) as { token: string };
  return data.token;
}

export async function startCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  if (!(await isPaymobConfigured())) {
    throw new Error('بوابة الدفع غير مفعلة — اضبط بيانات Paymob من صفحة بوابة الدفع');
  }
  const integrationId = await pickIntegration(input.method);
  const authToken = await auth();
  const paymobOrderId = await registerOrder(authToken, input);
  const paymentToken = await getPaymentKey(authToken, paymobOrderId, input, integrationId);

  const cfg = await getPaymobConfig();
  let redirectUrl: string;
  if (input.method === 'WALLET') {
    // Vodafone Cash — initiate the wallet payment server-side, then redirect customer
    // to the URL Paymob returns.
    if (!input.walletNumber) throw new Error('رقم محفظة فودافون كاش مطلوب');
    const payRes = await fetch(`${BASE}/acceptance/payments/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: { identifier: input.walletNumber, subtype: 'WALLET' },
        payment_token: paymentToken,
      }),
    });
    if (!payRes.ok) {
      const detail = await payRes.text();
      throw new Error(`Paymob wallet pay failed: ${payRes.status} ${detail}`);
    }
    const payData = (await payRes.json()) as {
      iframe_redirection_url?: string;
      redirect_url?: string;
    };
    redirectUrl = payData.iframe_redirection_url ?? payData.redirect_url ?? '';
    if (!redirectUrl) throw new Error('Paymob لم يرجع رابط تأكيد المحفظة');
  } else {
    // InstaPay — uses the same iframe flow but with the InstaPay integration_id
    if (!cfg.iframeId) throw new Error('Paymob Iframe ID مطلوب لـ InstaPay');
    redirectUrl = `${BASE}/acceptance/iframes/${cfg.iframeId}?payment_token=${paymentToken}`;
  }

  logger.info(
    { orderId: input.orderId, method: input.method, paymobOrderId },
    'paymob checkout initiated',
  );

  return { redirectUrl, paymobOrderId, paymentToken };
}

/**
 * Validates the HMAC that Paymob appends to every webhook so we can trust
 * the payload before mutating order state.
 */
export async function verifyWebhookHmac(
  payload: Record<string, unknown>,
  providedHmac: string,
): Promise<boolean> {
  const cfg = await getPaymobConfig();
  if (!cfg.hmac) {
    logger.warn('Paymob HMAC not configured — accepting webhook unverified');
    return true;
  }
  // Paymob concatenates a fixed set of fields from `obj` in alphabetical order
  // to compute the HMAC. Per their docs:
  const obj = (payload.obj ?? {}) as Record<string, unknown>;
  const order = (obj.order ?? {}) as Record<string, unknown>;
  const source = (obj.source_data ?? {}) as Record<string, unknown>;
  const fields = [
    obj.amount_cents,
    obj.created_at,
    obj.currency,
    obj.error_occured,
    obj.has_parent_transaction,
    obj.id,
    obj.integration_id,
    obj.is_3d_secure,
    obj.is_auth,
    obj.is_capture,
    obj.is_refunded,
    obj.is_standalone_payment,
    obj.is_voided,
    order.id,
    obj.owner,
    obj.pending,
    source.pan,
    source.sub_type,
    source.type,
    obj.success,
  ]
    .map((v) => String(v))
    .join('');
  const expected = crypto.createHmac('sha512', cfg.hmac).update(fields).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(providedHmac));
}
