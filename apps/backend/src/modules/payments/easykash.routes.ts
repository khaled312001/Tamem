/**
 * EasyKash routes — replaces the old Paymob routes file.
 *
 * Path layout matches Paymob's so the mobile app didn't need a coordinated
 * release: existing `/payments/orders/:id/checkout` and `/payments/config`
 * remain. The webhook moves from `/payments/webhook/paymob` to
 * `/payments/webhook/easykash` — the EasyKash dashboard needs to point at
 * the new path during integration setup.
 */
import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';

import * as ctrl from './easykash.controller.js';

// Public — capabilities the mobile renders against.
export const paymentsPublicRouter: Router = Router();
paymentsPublicRouter.get('/config', ctrl.config);
paymentsPublicRouter.get('/return', ctrl.returnPage);

// Customer-facing — initiate an EasyKash checkout for a specific order.
export const paymentsCustomerRouter: Router = Router();
paymentsCustomerRouter.use(requireAuth);
paymentsCustomerRouter.post('/orders/:id/checkout', ctrl.checkout);

// Public webhook receiver — verified via signatureHash inside the controller.
export const easykashWebhookRouter: Router = Router();
easykashWebhookRouter.post('/easykash', ctrl.webhook);
