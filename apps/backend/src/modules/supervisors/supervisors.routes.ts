/**
 * Supervisors module — admin routes.
 *
 * Mounted at /api/v1/admin/supervisors by app.ts. The parent /admin/* router
 * already applies requireAuth + requireRole(ADMIN) + adminAuditLog, so we
 * don't repeat them here.
 *
 * Route ordering note: GET /current must precede GET /:id so the literal
 * "current" doesn't get treated as a supervisor id.
 */
import { Router } from 'express';

import * as ctrl from './supervisors.controller.js';

export const adminSupervisorsRouter: Router = Router();

// Supervisor CRUD
adminSupervisorsRouter.get('/current', ctrl.getCurrent);
adminSupervisorsRouter.get('/', ctrl.list);
adminSupervisorsRouter.post('/', ctrl.create);

// Shift management — child of /supervisors/:id
adminSupervisorsRouter.post('/:id/shifts', ctrl.addShift);
adminSupervisorsRouter.get('/:id/reports', ctrl.getReports);

// Standalone shift mutation (uses shiftId, not supervisorId)
adminSupervisorsRouter.patch('/shifts/:shiftId', ctrl.updateShift);
adminSupervisorsRouter.delete('/shifts/:shiftId', ctrl.deleteShift);

// Supervisor mutation — keep last so /current and /shifts/:shiftId don't
// collide with /:id matching.
adminSupervisorsRouter.patch('/:id', ctrl.update);
adminSupervisorsRouter.delete('/:id', ctrl.softDelete);
