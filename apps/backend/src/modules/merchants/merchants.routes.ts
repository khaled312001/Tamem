import { Router } from 'express';

import * as ctrl from './merchants.controller.js';
import * as hours from './merchantHours.controller.js';
import * as productApi from '../productSync/productSync.controller.js';

export const adminMerchantsRouter: Router = Router();

adminMerchantsRouter.get('/', ctrl.list);
adminMerchantsRouter.post('/', ctrl.create);
// Before '/:id' — otherwise Express reads 'stats' as a merchant id.
adminMerchantsRouter.get('/stats', ctrl.stats);
adminMerchantsRouter.get('/:id', ctrl.get);
adminMerchantsRouter.patch('/:id', ctrl.update);
adminMerchantsRouter.delete('/:id', ctrl.remove);

// Per-merchant opening hours + manual status override.
adminMerchantsRouter.get('/:id/hours', hours.listHours);
adminMerchantsRouter.put('/:id/hours', hours.setHours);
adminMerchantsRouter.patch('/:id/status', hours.setStatus);

// External product-feed integration.
adminMerchantsRouter.get('/:id/api-config', productApi.getConfig);
adminMerchantsRouter.put('/:id/api-config', productApi.upsertConfig);
adminMerchantsRouter.delete('/:id/api-config', productApi.deleteConfig);
adminMerchantsRouter.post('/:id/api-config/test', productApi.testConnect);
adminMerchantsRouter.post('/:id/api-config/sync', productApi.triggerSync);
adminMerchantsRouter.get('/:id/api-config/logs', productApi.listLogs);
