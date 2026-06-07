import { Router } from 'express';

import * as ctrl from './merchants.controller.js';
import * as hours from './merchantHours.controller.js';

export const adminMerchantsRouter: Router = Router();

adminMerchantsRouter.get('/', ctrl.list);
adminMerchantsRouter.post('/', ctrl.create);
adminMerchantsRouter.get('/:id', ctrl.get);
adminMerchantsRouter.patch('/:id', ctrl.update);
adminMerchantsRouter.delete('/:id', ctrl.remove);

// Per-merchant opening hours + manual status override.
adminMerchantsRouter.get('/:id/hours', hours.listHours);
adminMerchantsRouter.put('/:id/hours', hours.setHours);
adminMerchantsRouter.patch('/:id/status', hours.setStatus);
