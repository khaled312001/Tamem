import { Router } from 'express';

import * as ctrl from './categories.controller.js';

export const adminCategoriesRouter: Router = Router();

adminCategoriesRouter.get('/', ctrl.list);
adminCategoriesRouter.post('/', ctrl.create);
adminCategoriesRouter.patch('/:id', ctrl.update);
adminCategoriesRouter.delete('/:id', ctrl.remove);
