import { Router } from 'express';

import * as ctrl from './merchants.controller.js';

export const adminMerchantsRouter: Router = Router();

adminMerchantsRouter.get('/', ctrl.list);
adminMerchantsRouter.post('/', ctrl.create);
adminMerchantsRouter.get('/:id', ctrl.get);
adminMerchantsRouter.patch('/:id', ctrl.update);
adminMerchantsRouter.delete('/:id', ctrl.remove);
