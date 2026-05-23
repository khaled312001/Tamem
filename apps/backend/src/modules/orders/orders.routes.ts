import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';

import * as ctrl from './orders.customer.controller.js';

export const ordersRouter: Router = Router();
ordersRouter.use(requireAuth);

ordersRouter.post('/', ctrl.createOrder);
ordersRouter.get('/mine', ctrl.listMine);
ordersRouter.get('/:id', ctrl.getMine);
ordersRouter.post('/:id/approve', ctrl.approveOrder);
ordersRouter.post('/:id/cancel', ctrl.cancelMine);

export const pricingRouter: Router = Router();
pricingRouter.post('/estimate', ctrl.estimatePrice);
