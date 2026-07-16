import { Router } from 'express';

import * as audit from '../audit/audit.controller.js';
import * as ctrl from './products.controller.js';

export const adminProductsRouter: Router = Router();

adminProductsRouter.get('/', ctrl.list);
adminProductsRouter.post('/', ctrl.create);
adminProductsRouter.post('/bulk-availability', ctrl.bulkAvailability);
adminProductsRouter.get('/:id/history', audit.productHistory);
adminProductsRouter.patch('/:id', ctrl.update);
adminProductsRouter.delete('/:id', ctrl.remove);
