import { Router } from 'express';

import * as ctrl from './alerts.controller.js';

export const adminAlertsRouter: Router = Router();

adminAlertsRouter.get('/', ctrl.list);
adminAlertsRouter.patch('/:id/resolve', ctrl.resolve);
