import { Router } from 'express';

import * as ctrl from './drivers.controller.js';

export const adminDriversRouter: Router = Router();

adminDriversRouter.get('/', ctrl.list);
adminDriversRouter.post('/', ctrl.create);
adminDriversRouter.get('/:id', ctrl.get);
adminDriversRouter.patch('/:id', ctrl.update);
adminDriversRouter.patch('/:id/status', ctrl.updateStatus);
adminDriversRouter.delete('/:id', ctrl.remove);
