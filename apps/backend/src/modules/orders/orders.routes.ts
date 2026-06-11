import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';

import * as cartCtrl from './orders.cart.controller.js';
import * as ctrl from './orders.customer.controller.js';
import * as receiptCtrl from './orders.receipt.controller.js';
import * as reviewCtrl from './orders.review.controller.js';

export const ordersRouter: Router = Router();
ordersRouter.use(requireAuth);

ordersRouter.post('/', ctrl.createOrder);
// Multi-merchant cart checkout — splits into parent + sub-orders.
ordersRouter.post('/cart', cartCtrl.createCartOrder);
// "from/:id" must come BEFORE "/:id" routes so the :id param doesn't capture "from"
ordersRouter.post('/from/:id', ctrl.reorderFromExisting);
ordersRouter.get('/mine', ctrl.listMine);
ordersRouter.get('/:id', ctrl.getMine);
ordersRouter.post('/:id/approve', ctrl.approveOrder);
ordersRouter.post('/:id/cancel', ctrl.cancelMine);
ordersRouter.get('/:id/review', reviewCtrl.getOrderReview);
ordersRouter.post('/:id/review', reviewCtrl.createOrderReview);
// Receipt / invoice — JSON for mobile native rendering, HTML for the
// share-by-WhatsApp link (opens directly in any browser).
ordersRouter.get('/:id/receipt.json', receiptCtrl.getReceiptJson);
ordersRouter.get('/:id/receipt', receiptCtrl.getReceiptHtml);

export const pricingRouter: Router = Router();
pricingRouter.post('/estimate', ctrl.estimatePrice);
