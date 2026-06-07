import { Router } from 'express';

import * as ctrl from './alerts.controller.js';

export const adminAlertsRouter: Router = Router();

adminAlertsRouter.get('/', ctrl.list);
adminAlertsRouter.get('/stats', ctrl.stats);
adminAlertsRouter.get('/:id', ctrl.getOne);
adminAlertsRouter.post('/:id/ack', ctrl.ack);
adminAlertsRouter.post('/:id/resolve', ctrl.resolve);
adminAlertsRouter.patch('/:id/resolve', ctrl.resolve); // legacy compat
adminAlertsRouter.post('/:id/dismiss', ctrl.dismiss);
adminAlertsRouter.post('/:id/escalate', ctrl.escalate);
adminAlertsRouter.post('/:id/note', ctrl.addNote);
