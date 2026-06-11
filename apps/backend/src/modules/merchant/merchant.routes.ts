/**
 * Merchant self-service routes.
 *
 * All handlers require an authenticated MERCHANT user. Mount under `/merchant`
 * — never under `/admin`, since merchants don't have admin privileges and
 * the admin namespace also pulls in the audit middleware which would
 * mis-attribute every merchant action as an admin one.
 */
import { Router } from 'express';

import { UserRole } from '@tamem/types';

import { requireAuth, requireRole } from '../../middleware/auth.js';

import * as ctrl from './merchant.controller.js';

export const merchantRouter: Router = Router();

merchantRouter.use(requireAuth, requireRole(UserRole.MERCHANT));

// Profile + dashboard KPIs
merchantRouter.get('/me', ctrl.me);

// Orders
merchantRouter.get('/orders', ctrl.listOrders);
merchantRouter.patch('/orders/:id/accept', ctrl.acceptOrder);
merchantRouter.patch('/orders/:id/reject', ctrl.rejectOrder);

// Catalog
merchantRouter.get('/products', ctrl.listProducts);
merchantRouter.post('/products', ctrl.createProduct);
merchantRouter.patch('/products/:id', ctrl.updateProduct);
merchantRouter.delete('/products/:id', ctrl.removeProduct);
