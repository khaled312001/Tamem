import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';

import * as ctrl from './coupons.controller.js';

/** Customer-facing — GET /coupons/available + POST /coupons/validate */
export const couponsRouter: Router = Router();
couponsRouter.use(requireAuth);
couponsRouter.get('/available', ctrl.listAvailable);
couponsRouter.post('/validate', ctrl.validateCoupon);

/** Admin CRUD — /admin/coupons */
export const adminCouponsRouter: Router = Router();
adminCouponsRouter.get('/', ctrl.adminList);
adminCouponsRouter.post('/', ctrl.adminCreate);
adminCouponsRouter.patch('/:id', ctrl.adminUpdate);
adminCouponsRouter.delete('/:id', ctrl.adminDelete);
