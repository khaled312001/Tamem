import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';

import * as ctrl from './notifications.controller.js';

export const notificationsRouter: Router = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get('/', ctrl.list);
notificationsRouter.get('/unread-count', ctrl.unreadCount);
notificationsRouter.patch('/read-all', ctrl.markAllRead);
notificationsRouter.patch('/:id/read', ctrl.markRead);
