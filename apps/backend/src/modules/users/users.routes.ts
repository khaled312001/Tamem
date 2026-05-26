import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';

import { updateMyLocation } from '../drivers/driver.location.controller.js';

import {
  createAddress,
  deleteAddress,
  listAddresses,
  updateAddress,
} from './addresses.controller.js';
import { changePassword, getMe, setFcmToken, updateMe } from './users.controller.js';

// /me/* — current user routes (any authenticated role)
export const meRouter: Router = Router();
meRouter.use(requireAuth);

meRouter.get('/', getMe);
meRouter.patch('/', updateMe);
meRouter.post('/change-password', changePassword);
meRouter.post('/fcm-token', setFcmToken);
meRouter.post('/location', updateMyLocation);

meRouter.get('/addresses', listAddresses);
meRouter.post('/addresses', createAddress);
meRouter.patch('/addresses/:id', updateAddress);
meRouter.delete('/addresses/:id', deleteAddress);
