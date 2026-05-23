import { Router } from 'express';

import * as ctrl from './payments.controller.js';

export const adminPaymentsRouter: Router = Router();

adminPaymentsRouter.get('/', ctrl.list);
adminPaymentsRouter.patch('/:id/confirm', ctrl.confirm);
adminPaymentsRouter.patch('/:id/reject', ctrl.reject);
