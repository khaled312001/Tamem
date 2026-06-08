import { Router } from 'express';

import * as ctrl from './customers.controller.js';

export const adminCustomersRouter: Router = Router();

adminCustomersRouter.get('/', ctrl.list);
adminCustomersRouter.get('/:id', ctrl.get);
adminCustomersRouter.patch('/:id', ctrl.update);
// Address book — admin can add, edit, or delete a customer's saved addresses.
adminCustomersRouter.post('/:id/addresses', ctrl.addAddress);
adminCustomersRouter.patch('/:id/addresses/:addressId', ctrl.updateAddress);
adminCustomersRouter.delete('/:id/addresses/:addressId', ctrl.deleteAddress);
