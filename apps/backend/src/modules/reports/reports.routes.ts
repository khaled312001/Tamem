import { Router } from 'express';

import * as ctrl from './reports.controller.js';

export const adminReportsRouter: Router = Router();

adminReportsRouter.get('/revenue', ctrl.revenue);
adminReportsRouter.get('/services', ctrl.services);
adminReportsRouter.get('/drivers', ctrl.drivers);
adminReportsRouter.get('/customers', ctrl.customers);
