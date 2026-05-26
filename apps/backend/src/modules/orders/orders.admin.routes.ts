import { Router } from 'express';

import * as ctrl from './orders.admin.controller.js';

export const adminOrdersRouter: Router = Router();

adminOrdersRouter.get('/', ctrl.adminList);
// bulk-status must come BEFORE /:id so it isn't captured by the param route
adminOrdersRouter.post('/bulk-status', ctrl.adminBulkStatus);
adminOrdersRouter.get('/:id', ctrl.adminGet);
adminOrdersRouter.patch('/:id/status', ctrl.adminUpdateStatus);
adminOrdersRouter.patch('/:id/price', ctrl.adminSetPrice);
adminOrdersRouter.patch('/:id/assign-driver', ctrl.adminAssignDriver);
adminOrdersRouter.post('/:id/note', ctrl.adminAddNote);
adminOrdersRouter.post('/:id/cancel', ctrl.adminCancel);
