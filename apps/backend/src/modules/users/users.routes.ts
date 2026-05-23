import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';

import { getMe, setFcmToken, updateMe } from './users.controller.js';

// /me/* — current user routes (any authenticated role)
export const meRouter: Router = Router();
meRouter.use(requireAuth);

meRouter.get('/', getMe);
meRouter.patch('/', updateMe);
meRouter.post('/fcm-token', setFcmToken);
