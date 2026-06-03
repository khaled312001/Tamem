import { Router } from 'express';

import * as gateway from './easykash.controller.js';
import * as ctrl from './payments.controller.js';

export const adminPaymentsRouter: Router = Router();

adminPaymentsRouter.get('/', ctrl.list);
adminPaymentsRouter.patch('/:id/confirm', ctrl.confirm);
adminPaymentsRouter.patch('/:id/reject', ctrl.reject);
adminPaymentsRouter.patch('/:id/refund', ctrl.refund);

// EasyKash gateway management — replaces the old Paymob admin handlers.
adminPaymentsRouter.get('/gateway', gateway.adminStatus);
adminPaymentsRouter.put('/gateway', gateway.adminSave);
adminPaymentsRouter.post('/gateway/test', gateway.adminTest);
