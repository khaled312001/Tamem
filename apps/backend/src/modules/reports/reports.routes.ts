import { Router } from 'express';

import * as ctrl from './reports.controller.js';
import { detailedRevenue } from './revenue.controller.js';
import { revenueCsv } from './revenue.export.controller.js';

export const adminReportsRouter: Router = Router();

adminReportsRouter.get('/revenue', ctrl.revenue);
adminReportsRouter.get('/services', ctrl.services);
adminReportsRouter.get('/drivers', ctrl.drivers);
adminReportsRouter.get('/customers', ctrl.customers);

// Accountant-grade detailed revenue report + CSV export.
adminReportsRouter.get('/revenue/detailed', detailedRevenue);
adminReportsRouter.get('/revenue.csv', revenueCsv);
