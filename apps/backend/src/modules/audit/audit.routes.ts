import { Router } from 'express';

import * as ctrl from './audit.controller.js';

/** Mounted at /admin/import-jobs. */
export const adminImportJobsRouter: Router = Router();

adminImportJobsRouter.get('/', ctrl.listJobs);
adminImportJobsRouter.post('/', ctrl.createJob);
// Registered before '/:id' so the literal segments win the match.
adminImportJobsRouter.get('/:id/products', ctrl.jobProducts);
adminImportJobsRouter.post('/:id/rows', ctrl.logRows);
adminImportJobsRouter.get('/:id', ctrl.getJob);
adminImportJobsRouter.patch('/:id', ctrl.updateJob);
adminImportJobsRouter.delete('/:id', ctrl.removeJob);
