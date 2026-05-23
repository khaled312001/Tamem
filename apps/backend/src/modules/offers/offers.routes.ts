import { Router } from 'express';

import * as ctrl from './offers.controller.js';

export const adminOffersRouter: Router = Router();

adminOffersRouter.get('/', ctrl.list);
adminOffersRouter.post('/', ctrl.create);
adminOffersRouter.patch('/:id', ctrl.update);
adminOffersRouter.delete('/:id', ctrl.remove);
