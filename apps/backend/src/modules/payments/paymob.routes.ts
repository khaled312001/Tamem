import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';

import * as ctrl from './paymob.controller.js';

// Public — what methods are available (mobile reads this to render UI)
export const paymentsPublicRouter: Router = Router();
paymentsPublicRouter.get('/config', ctrl.config);

// Customer-facing — initiate a Paymob checkout for a specific order
export const paymentsCustomerRouter: Router = Router();
paymentsCustomerRouter.use(requireAuth);
paymentsCustomerRouter.post('/orders/:id/checkout', ctrl.checkout);

// Public webhook receiver — verified via HMAC inside the controller
export const paymobWebhookRouter: Router = Router();
paymobWebhookRouter.post('/paymob', ctrl.webhook);
