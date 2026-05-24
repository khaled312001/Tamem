import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import * as paymob from '../../integrations/paymob.js';
import { BadRequestError, NotFoundError } from '../../utils/errors.js';
import { ok } from '../../utils/response.js';

// We expose only Vodafone Cash + InstaPay as online payment options
// (these are the two methods Nafezly's Python wrapper would also expose
// via Paymob — we call Paymob directly instead so the backend stays Node).
const checkoutSchema = z.object({
  method: z.enum(['WALLET', 'INSTAPAY']),
  walletNumber: z
    .string()
    .regex(/^01\d{9}$/, 'رقم محفظة فودافون كاش غير صحيح')
    .optional(),
});

/**
 * GET /payments/config — tells the mobile app which payment methods
 * are currently enabled by the backend's env config.
 */
export const config: RequestHandler = async (_req, res, next) => {
  try {
    const { getPaymobConfig } = await import('./paymob.config.js');
    const cfg = await getPaymobConfig();
    const apiOk = !!cfg.apiKey;
    ok(res, {
      cash: true, // always available — pay the driver on delivery
      vodafoneCash: apiOk && !!cfg.walletIntegrationId,
      instapay: apiOk && !!cfg.instapayIntegrationId,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /orders/:id/checkout — customer initiates an online payment
 * for an already-quoted order. Returns the redirect URL the mobile app
 * should open.
 */
export const checkout: RequestHandler = async (req, res, next) => {
  try {
    const input = checkoutSchema.parse(req.body);
    const orderId = String(req.params.id);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: { select: { name: true, phone: true, email: true } } },
    });
    if (!order) throw new NotFoundError('Order', 'الطلب غير موجود');
    if (!order.customer) throw new NotFoundError('Customer', 'العميل غير موجود');
    if (order.customerId !== req.user!.id) {
      throw new BadRequestError('UNAUTHORIZED_ORDER', 'لا يمكنك دفع طلب لا يخصك');
    }
    const amount = Number(order.quotedPrice ?? order.finalPrice);
    if (!amount || amount <= 0) {
      throw new BadRequestError('NOT_PRICED', 'الطلب لم يُسعّر بعد');
    }
    if (input.method === 'WALLET' && !input.walletNumber) {
      throw new BadRequestError('WALLET_REQUIRED', 'يرجى إدخال رقم محفظة فودافون كاش');
    }

    const result = await paymob.startCheckout({
      orderId: order.id,
      orderNumber: order.orderNumber,
      amountEgp: amount,
      method: input.method,
      customer: {
        name: order.customer.name,
        phone: order.customer.phone,
        email: order.customer.email ?? undefined,
      },
      walletNumber: input.walletNumber,
    });

    // Record a PENDING payment row so the dashboard sees it.
    // NB: the Prisma PaymentMethod enum only has CASH/VODAFONE_CASH/INSTAPAY.
    // CARD payments are recorded as INSTAPAY until the schema migration adds CARD.
    const dbMethod = input.method === 'WALLET' ? 'VODAFONE_CASH' : 'INSTAPAY';
    await prisma.payment.create({
      data: {
        orderId: order.id,
        amount,
        method: dbMethod,
        status: 'PENDING',
        referenceNumber: String(result.paymobOrderId),
      },
    });

    ok(res, { redirectUrl: result.redirectUrl, paymobOrderId: result.paymobOrderId });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /payments/webhook/paymob — receives Paymob callbacks.
 * Verifies the HMAC, then flips the payment row + order status.
 */
export const webhook: RequestHandler = async (req, res, next) => {
  try {
    const hmac = String(req.query.hmac ?? req.headers['x-hmac'] ?? '');
    if (!(await paymob.verifyWebhookHmac(req.body, hmac))) {
      return res.status(400).json({ error: { code: 'BAD_HMAC', message: 'Invalid signature' } });
    }
    const obj = (req.body.obj ?? {}) as Record<string, unknown>;
    const success = Boolean(obj.success);
    const merchantOrderId = String(
      (((obj.order ?? {}) as Record<string, unknown>).merchant_order_id ?? '') as string,
    );
    if (!merchantOrderId) {
      return res.status(200).json({ ok: true, note: 'no merchant_order_id' });
    }

    const order = await prisma.order.findUnique({ where: { id: merchantOrderId } });
    if (!order) return res.status(200).json({ ok: true, note: 'order not found' });

    // Find the matching pending payment
    const pmRef = String(obj.id ?? '');
    const payment = await prisma.payment.findFirst({
      where: { orderId: order.id, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    if (payment) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: success ? 'PAID' : 'FAILED',
          referenceNumber: pmRef || payment.referenceNumber,
          confirmedAt: success ? new Date() : undefined,
        },
      });
    }
    // Flip order to ACCEPTED if successful — admin can then assign driver
    if (success && order.status === 'AWAITING_CUSTOMER_APPROVAL') {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'ACCEPTED', paymentStatus: 'PAID' },
      });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
};
