import { Router } from 'express';

import * as ctrl from './settings.controller.js';

export const adminSettingsRouter: Router = Router();

adminSettingsRouter.get('/', ctrl.list);
adminSettingsRouter.post('/bulk', ctrl.bulk);
adminSettingsRouter.get('/:key', ctrl.get);
adminSettingsRouter.put('/:key', ctrl.upsert);
