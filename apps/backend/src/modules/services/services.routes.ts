import { Router } from 'express';

import { UserRole } from '@tamem/types';

import { requireAuth, requireRole } from '../../middleware/auth.js';

import * as ctrl from './services.controller.js';

// Public routes (mounted at /services)
export const publicServicesRouter: Router = Router();
publicServicesRouter.get('/', ctrl.list);
publicServicesRouter.get('/:id', ctrl.getById);

// Admin routes (mounted at /admin/services, protected upstream)
export const adminServicesRouter: Router = Router();
adminServicesRouter.use(requireAuth, requireRole(UserRole.ADMIN));

adminServicesRouter.get('/', ctrl.adminList);
adminServicesRouter.post('/', ctrl.adminCreate);
adminServicesRouter.get('/:id', ctrl.adminGet);
adminServicesRouter.patch('/:id', ctrl.adminUpdate);
adminServicesRouter.delete('/:id', ctrl.adminDelete);
adminServicesRouter.post('/:id/duplicate', ctrl.adminDuplicate);

adminServicesRouter.post('/:id/fields', ctrl.adminAddField);
// Reorder must come BEFORE :fieldId to prevent 'reorder' being captured as fieldId
adminServicesRouter.patch('/:id/fields/reorder', ctrl.adminReorderFields);
adminServicesRouter.patch('/:id/fields/:fieldId', ctrl.adminUpdateField);
adminServicesRouter.delete('/:id/fields/:fieldId', ctrl.adminDeleteField);
