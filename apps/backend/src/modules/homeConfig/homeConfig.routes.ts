import { Router } from 'express';

import { getAdminConfig, getPublicConfig, patchAdminConfig } from './homeConfig.controller.js';

// Public router — mounted at /home-config, no auth.
export const publicHomeConfigRouter: Router = Router();
publicHomeConfigRouter.get('/', getPublicConfig);

// Admin router — mounted at /admin/home-config (admin auth applied at parent).
export const adminHomeConfigRouter: Router = Router();
adminHomeConfigRouter.get('/', getAdminConfig);
adminHomeConfigRouter.patch('/', patchAdminConfig);
