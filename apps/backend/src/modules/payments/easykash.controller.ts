/**
 * EasyKash customer + webhook controllers.
 *
 * Routes:
 *   GET  /payments/config             — public, used by mobile to render the
 *                                        single "ادفع أونلاين" CTA when the
 *                                        gateway is enabled.
 *   POST /payments/orders/:id/checkout — authed, creates an EasyKash payment
 *                                        intent for an already-priced order
 *                                        and returns the hosted redirect URL.
 *   POST /payments/webhook/easykash    — public, signed by EasyKash via the
 *                                        `signatureHash` field. Marks the
 *                                        Payment + Order paid.
 */
import type { RequestHandler } from 'express';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import * as easykash from '../../integrations/easykash.js';
import { BadRequestError, NotFoundError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { ok } from '../../utils/response.js';

import { getEasyKashConfig } from './easykash.config.js';

/**
 * GET /payments/config — mobile reads this to decide whether to show the
 * pay-online CTA. Returns both the legacy method-by-method flags (so older
 * clients keep working during rollout) and the new `online` boolean.
 */
export const config: RequestHandler = async (_req, res, next) => {
  try {
    const cfg = await getEasyKashConfig();
    const configured = await easykash.isEasyKashConfigured();
    const opts = new Set(cfg.paymentOptions);
    // Best-effort mapping of EasyKash's enum to the method labels the
    // mobile app shows in the legacy PaymentMethods screen. The exact
    // numbers are admin-tunable so we cover all known IDs.
    ok(res, {
      gateway: 'easykash',
      online: configured,
      cash: true, // cash-on-delivery is always offered
      methods: {
        vodafoneCash: configured && (opts.has(3) || opts.has(7)),
        instapay: configured && (opts.has(4) || opts.has(11)),
        visa: configured && opts.has(2),
        mastercard: configured && opts.has(2),
        meeza: configured && (opts.has(5) || opts.has(6) || opts.has(12)),
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /payments/orders/:id/checkout — customer wants to pay an order
 * online. Resolves the order, makes sure it's quoted, calls EasyKash,
 * records a PENDING Payment row, and returns the hosted redirect URL.
 *
 * Body is intentionally empty — EasyKash decides the actual method on
 * its hosted page based on the `paymentOptions` admin selected.
 */
export const checkout: RequestHandler = async (req, res, next) => {
  try {
    const orderId = String(req.params.id);
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: { select: { name: true, phone: true, email: true } } },
    });
    if (!order) throw new NotFoundError('Order', 'الطلب غير موجود');
    if (order.customerId !== req.user!.id) {
      throw new BadRequestError('UNAUTHORIZED_ORDER', 'لا يمكنك دفع طلب لا يخصك');
    }
    const amount = Number(order.quotedPrice ?? order.finalPrice);
    if (!amount || amount <= 0) {
      throw new BadRequestError('NOT_PRICED', 'الطلب لم يُسعّر بعد');
    }

    const result = await easykash.startCheckout({
      orderId: order.id,
      orderNumber: order.orderNumber,
      amountEgp: amount,
      customer: {
        name: order.customer.name,
        phone: order.customer.phone,
        email: order.customer.email ?? undefined,
      },
      redirectUrl: env.EASYKASH_REDIRECT_URL ?? `${env.API_BASE_URL}/payments/return`,
    });

    // Record a PENDING Payment row so the dashboard can show "in progress"
    // while EasyKash bounces the customer between pages. The webhook will
    // flip status → PAID once the signature is verified.
    // The Prisma PaymentMethod enum predates EasyKash and only has
    // CASH/VODAFONE_CASH/INSTAPAY — we tag the row as VODAFONE_CASH for
    // now and rely on the webhook's `PaymentMethod` field for the true
    // method label in the audit trail.
    await prisma.payment.create({
      data: {
        orderId: order.id,
        amount,
        method: 'VODAFONE_CASH',
        status: 'PENDING',
        notes: 'EasyKash checkout',
      },
    });

    ok(res, { redirectUrl: result.redirectUrl, gateway: 'easykash' });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /payments/webhook/easykash — EasyKash POSTs here on success/failure.
 * The payload is signed with SHA-512 HMAC; we verify before touching the
 * order state. EasyKash retries (5+ times) so this handler must be
 * idempotent — guarded by the Payment.referenceNumber check.
 */
export const webhook: RequestHandler = async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as Partial<easykash.CallbackPayload>;
    const required: (keyof easykash.CallbackPayload)[] = [
      'ProductCode',
      'PaymentMethod',
      'ProductType',
      'Amount',
      'status',
      'easykashRef',
      'customerReference',
      'signatureHash',
    ];
    for (const k of required) {
      if (!body[k]) {
        return res
          .status(400)
          .json({ error: { code: 'MISSING_FIELD', message: `missing field: ${k}` } });
      }
    }
    const payload = body as easykash.CallbackPayload;

    const verified = await easykash.verifyCallbackSignature(payload);
    if (!verified) {
      logger.warn(
        { customerReference: payload.customerReference, easykashRef: payload.easykashRef },
        'EasyKash webhook signature mismatch',
      );
      return res
        .status(400)
        .json({ error: { code: 'BAD_SIGNATURE', message: 'Invalid signature' } });
    }

    const order = await prisma.order.findUnique({
      where: { id: payload.customerReference },
    });
    if (!order) {
      logger.warn(
        { customerReference: payload.customerReference },
        'EasyKash webhook: unknown order',
      );
      // We still 200 the webhook — EasyKash retries on non-2xx forever.
      return res.status(200).json({ ok: true, note: 'order not found' });
    }

    const isSuccess = payload.status.toUpperCase() === 'PAID';
    const referenceNumber = payload.easykashRef;

    // Idempotency: if we already processed this easykashRef, no-op.
    const existing = await prisma.payment.findFirst({
      where: { orderId: order.id, referenceNumber },
    });
    if (existing && existing.status === (isSuccess ? 'PAID' : 'FAILED')) {
      return res.status(200).json({ ok: true, note: 'already processed' });
    }

    // Find the most recent PENDING payment row created by /checkout and
    // update it. If none, create one — covers the case where the customer
    // refreshes and triggers a second webhook before the first /checkout
    // call lands in our DB.
    const payment =
      (await prisma.payment.findFirst({
        where: { orderId: order.id, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      })) ??
      (await prisma.payment.create({
        data: {
          orderId: order.id,
          amount: Number(payload.Amount),
          method: 'VODAFONE_CASH',
          status: 'PENDING',
          notes: `EasyKash ${payload.PaymentMethod}`,
        },
      }));

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: isSuccess ? 'PAID' : 'FAILED',
        referenceNumber,
        confirmedAt: isSuccess ? new Date() : undefined,
        notes: `EasyKash ${payload.PaymentMethod}`,
      },
    });

    // Auto-advance the order if it was sitting on AWAITING_CUSTOMER_APPROVAL.
    // Customer effectively approves the price by paying.
    if (isSuccess && order.status === 'AWAITING_CUSTOMER_APPROVAL') {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'ACCEPTED', paymentStatus: 'PAID' },
      });
    } else if (isSuccess) {
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: 'PAID' },
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /payments/return — the page EasyKash bounces the customer back to
 * after they finish on the hosted form. We render a tiny self-closing
 * HTML page; the mobile app's WebBrowser session ends and the order page
 * picks up the fresh state via Socket.IO.
 */
export const returnPage: RequestHandler = (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>تم استلام الدفع - تميم</title>
<style>
  body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #F7F4EF; color: #241310; }
  .wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; text-align: center; }
  .card { background: #fff; border-radius: 16px; padding: 28px 24px; max-width: 360px; box-shadow: 0 12px 40px rgba(0,0,0,.06); }
  .check { width: 64px; height: 64px; border-radius: 50%; background: #E0301E; color: #fff; display: grid; place-items: center; margin: 0 auto 16px; font-size: 36px; }
  h1 { margin: 0 0 8px; font-size: 20px; }
  p { margin: 0; color: #6b6b6b; line-height: 1.6; }
</style>
</head>
<body>
  <div class="wrap"><div class="card">
    <div class="check">✓</div>
    <h1>شكراً لك</h1>
    <p>تم إرسال نتيجة الدفع. ارجع للتطبيق وستجد طلبك محدّثاً خلال ثوانٍ.</p>
  </div></div>
</body>
</html>`);
};

// Admin status / save / test handlers — used by the dashboard
// /payment-gateway page. Replaces the old Paymob admin controller.
export const adminStatusSchema = z.object({});

function mask(value: string | undefined, keep = 4): string | null {
  if (!value) return null;
  if (value.length <= keep) return '•••';
  return `${'•'.repeat(Math.min(8, value.length - keep))}${value.slice(-keep)}`;
}

export const adminStatus: RequestHandler = async (_req, res, next) => {
  try {
    const cfg = await getEasyKashConfig();
    const configured = await easykash.isEasyKashConfigured();
    ok(res, {
      gateway: 'easykash',
      configured,
      paymentOptions: cfg.paymentOptions,
      keys: {
        apiKey: mask(cfg.apiKey),
        hmacSecret: mask(cfg.hmacSecret),
      },
    });
  } catch (err) {
    next(err);
  }
};

const saveSchema = z.object({
  apiKey: z.string().trim().optional(),
  hmacSecret: z.string().trim().optional(),
  paymentOptions: z.array(z.coerce.number().int().positive()).optional(),
});

export const adminSave: RequestHandler = async (req, res, next) => {
  try {
    const input = saveSchema.parse(req.body);
    const { setEasyKashConfig } = await import('./easykash.config.js');
    const update: Record<string, unknown> = {};
    if ('apiKey' in input) update.apiKey = input.apiKey;
    if ('hmacSecret' in input) update.hmacSecret = input.hmacSecret;
    if ('paymentOptions' in input && Array.isArray(input.paymentOptions)) {
      update.paymentOptions = input.paymentOptions;
    }
    await setEasyKashConfig(update);
    logger.info('EasyKash admin config updated');
    ok(res, { saved: true });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /admin/payments/gateway/test — fires a tiny pay-link request with
 * minimal amount (1 EGP) and asserts EasyKash returns a redirectUrl,
 * confirming the API key is valid. The pay link expires unused.
 */
export const adminTest: RequestHandler = async (_req, res) => {
  const cfg = await getEasyKashConfig(true);
  if (!cfg.apiKey) {
    return res.json({ data: { ok: false, reason: 'API Key مش مضبوط' } });
  }
  try {
    const r = await fetch('https://back.easykash.net/api/directpayv1/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: cfg.apiKey },
      body: JSON.stringify({
        amount: 1,
        currency: 'EGP',
        paymentOptions: cfg.paymentOptions,
        cashExpiry: 1,
        name: 'Tamem Test',
        email: 'test@deliverytamem.com',
        mobile: '01010101010',
        redirectUrl: 'https://deliverytamem.com',
        customerReference: `test-${Date.now()}`,
      }),
    });
    if (!r.ok) {
      const detail = await r.text();
      return res.json({
        data: { ok: false, reason: `EasyKash رفض (${r.status}): ${detail.slice(0, 200)}` },
      });
    }
    const data = (await r.json()) as { redirectUrl?: string };
    if (!data.redirectUrl) {
      return res.json({ data: { ok: false, reason: 'EasyKash لم يرجع redirectUrl' } });
    }
    return res.json({
      data: { ok: true, message: 'الاتصال بـ EasyKash ناجح ✓', preview: data.redirectUrl },
    });
  } catch (err) {
    return res.json({
      data: { ok: false, reason: err instanceof Error ? err.message : 'فشل الاتصال' },
    });
  }
};

// Re-export so existing route file imports keep working until they're
// renamed off `paymob.*` to `easykash.*`.
export { adminStatus as status, adminSave as save, adminTest as testConnection };
