import { Router } from 'express';

import * as ctrl from './catalog.controller.js';

export const categoriesRouter: Router = Router();
categoriesRouter.get('/', ctrl.listCategories);

export const merchantsRouter: Router = Router();
merchantsRouter.get('/', ctrl.listMerchants);
merchantsRouter.get('/:id', ctrl.getMerchant);
merchantsRouter.get('/:id/products', ctrl.getMerchantProducts);

export const offersRouter: Router = Router();
offersRouter.get('/', ctrl.listOffers);
