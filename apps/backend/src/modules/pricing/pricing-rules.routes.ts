import { Router } from 'express';

import * as ctrl from './pricing-rules.controller.js';

export const adminPricingRulesRouter: Router = Router();

adminPricingRulesRouter.get('/', ctrl.list);
adminPricingRulesRouter.post('/', ctrl.create);
adminPricingRulesRouter.patch('/:id', ctrl.update);
adminPricingRulesRouter.delete('/:id', ctrl.remove);
