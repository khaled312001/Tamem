import { Router } from 'express';

import { UserRole } from '@tamem/types';

import { requireAuth, requireRole } from '../../middleware/auth.js';

import { sendTest, start, status, stop } from './whatsapp.controller.js';

// /admin/whatsapp/* — admin-only WhatsApp bridge management
export const whatsappRouter: Router = Router();
whatsappRouter.use(requireAuth, requireRole(UserRole.ADMIN));

whatsappRouter.get('/status', status);
whatsappRouter.post('/start', start);
whatsappRouter.post('/stop', stop);
whatsappRouter.post('/send-test', sendTest);
