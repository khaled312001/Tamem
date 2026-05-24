import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';

import { validate } from './promos.controller.js';

export const promosRouter: Router = Router();
promosRouter.use(requireAuth);

promosRouter.post('/validate', validate);
