import { Router } from 'express';

import * as ctrl from './catalog.controller.js';

export const categoriesRouter: Router = Router();
categoriesRouter.get('/', ctrl.listCategories);

export const merchantsRouter: Router = Router();
merchantsRouter.get('/', ctrl.listMerchants);
// Batch openness — used by the cart to badge multiple merchants at once.
merchantsRouter.post('/openness', ctrl.merchantOpennessBatch);
merchantsRouter.get('/:id', ctrl.getMerchant);
merchantsRouter.get('/:id/products', ctrl.getMerchantProducts);

/** Public catalog of every available product, across all merchants. */
export const productsRouter: Router = Router();
productsRouter.get('/', ctrl.listAllProducts);
productsRouter.get('/:id', ctrl.getProduct);

export const offersRouter: Router = Router();
offersRouter.get('/', ctrl.listOffers);
