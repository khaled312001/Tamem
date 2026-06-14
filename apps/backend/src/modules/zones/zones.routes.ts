import { Router } from 'express';

import * as ctrl from './zones.controller.js';

// Public routes (mounted at /zones). No auth — the address picker calls
// these during the new-customer onboarding flow before login.
export const publicZonesRouter: Router = Router();
publicZonesRouter.get('/cities', ctrl.publicListCities);
publicZonesRouter.get('/cities/:id/villages', ctrl.publicListVillages);
publicZonesRouter.get('/villages/:id/areas', ctrl.publicListAreas);
publicZonesRouter.post('/quote-delivery', ctrl.publicQuoteDelivery);

// Admin routes (mounted at /admin/zones, protected upstream in app.ts by
// requireAuth + requireRole(ADMIN) + adminAuditLog).
export const adminZonesRouter: Router = Router();

// Cities
adminZonesRouter.get('/cities', ctrl.adminListCities);
adminZonesRouter.post('/cities', ctrl.adminCreateCity);
adminZonesRouter.patch('/cities/:id', ctrl.adminUpdateCity);
adminZonesRouter.delete('/cities/:id', ctrl.adminDeleteCity);

// Villages — nested list under a city + top-level CRUD by villageId
adminZonesRouter.get('/cities/:cityId/villages', ctrl.adminListVillages);
adminZonesRouter.post('/villages', ctrl.adminCreateVillage);
adminZonesRouter.patch('/villages/:id', ctrl.adminUpdateVillage);
adminZonesRouter.delete('/villages/:id', ctrl.adminDeleteVillage);

// Areas — nested list under a village + top-level CRUD by areaId
adminZonesRouter.get('/villages/:villageId/areas', ctrl.adminListAreas);
adminZonesRouter.post('/areas', ctrl.adminCreateArea);
adminZonesRouter.patch('/areas/:id', ctrl.adminUpdateArea);
adminZonesRouter.delete('/areas/:id', ctrl.adminDeleteArea);
