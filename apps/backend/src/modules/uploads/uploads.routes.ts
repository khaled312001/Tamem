import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';

import { uploadFile, uploadMiddleware } from './uploads.controller.js';

export const uploadsRouter: Router = Router();
uploadsRouter.post('/', requireAuth, uploadMiddleware, uploadFile);
