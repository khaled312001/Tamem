import compression from 'compression';
import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { corsOrigins, env } from './config/env.js';
import { requireAuth, requireRole } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { adminServicesRouter, publicServicesRouter } from './modules/services/services.routes.js';
import { logger } from './utils/logger.js';
import { ok } from './utils/response.js';

import { UserRole } from '@tamem/types';

export function createApp(): Express {
  const app = express();

  // ----- security & infra -----
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(pinoHttp({ logger }));

  // ----- rate limiting (basic global) -----
  app.use(
    '/api/',
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // ----- health & info -----
  app.get('/health', (_req, res) => ok(res, { status: 'ok', env: env.NODE_ENV, ts: Date.now() }));
  app.get('/', (_req, res) =>
    ok(res, { name: 'Tamem Delivery API', version: '0.1.0', docs: '/api/v1/docs' }),
  );

  // ----- API v1 -----
  const v1 = express.Router();

  v1.use('/auth', authRouter);
  v1.use('/services', publicServicesRouter);

  // example protected route — replace with real /me controller once users module exists
  v1.get('/me', requireAuth, (req, res) => ok(res, { id: req.user!.id, role: req.user!.role }));

  // ----- Admin namespace -----
  const adminRouter = express.Router();
  adminRouter.use(requireAuth, requireRole(UserRole.ADMIN));
  adminRouter.use('/services', adminServicesRouter);
  v1.use('/admin', adminRouter);

  app.use('/api/v1', v1);

  // ----- error handler (must be last) -----
  app.use(errorHandler);

  return app;
}
