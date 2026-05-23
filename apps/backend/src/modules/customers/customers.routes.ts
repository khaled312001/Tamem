import { Router } from 'express';

import * as ctrl from './customers.controller.js';

export const adminCustomersRouter: Router = Router();

adminCustomersRouter.get('/', ctrl.list);
adminCustomersRouter.get('/:id', ctrl.get);
