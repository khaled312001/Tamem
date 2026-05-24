import { Router } from 'express';

import * as gateway from './paymob.admin.controller.js';
import * as ctrl from './payments.controller.js';

export const adminPaymentsRouter: Router = Router();

adminPaymentsRouter.get('/', ctrl.list);
adminPaymentsRouter.patch('/:id/confirm', ctrl.confirm);
adminPaymentsRouter.patch('/:id/reject', ctrl.reject);

// Paymob gateway management
adminPaymentsRouter.get('/gateway', gateway.status);
adminPaymentsRouter.put('/gateway', gateway.save);
adminPaymentsRouter.post('/gateway/test', gateway.testConnection);
