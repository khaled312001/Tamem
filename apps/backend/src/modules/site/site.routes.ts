import { Router } from 'express';

import * as ctrl from './site.controller.js';

export const publicSiteRouter: Router = Router();
publicSiteRouter.get('/', ctrl.getPublic);

export const adminSiteRouter: Router = Router();
adminSiteRouter.get('/', ctrl.getAdmin);
adminSiteRouter.put('/', ctrl.updateAdmin);
