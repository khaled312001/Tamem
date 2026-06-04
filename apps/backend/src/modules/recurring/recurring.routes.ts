import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';

import { createOne, deleteOne, listMine, updateOne } from './recurring.controller.js';

// Mounted at /me/recurring-orders (see app.ts / users router).
export const recurringOrdersRouter: Router = Router();
recurringOrdersRouter.use(requireAuth);

recurringOrdersRouter.get('/', listMine);
recurringOrdersRouter.post('/', createOne);
recurringOrdersRouter.patch('/:id', updateOne);
recurringOrdersRouter.delete('/:id', deleteOne);
