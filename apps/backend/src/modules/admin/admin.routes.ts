import { Router } from 'express';

import * as overviewCtrl from './overview.controller.js';

export const adminOverviewRouter: Router = Router();

adminOverviewRouter.get('/', overviewCtrl.overview);
