import compression from 'compression';
import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { corsOrigins, env } from './config/env.js';
import { requireAuth, requireRole } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { adminOverviewRouter } from './modules/admin/admin.routes.js';
import { adminAlertsRouter } from './modules/alerts/alerts.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import {
  categoriesRouter,
  merchantsRouter,
  offersRouter,
} from './modules/catalog/catalog.routes.js';
import { adminCategoriesRouter } from './modules/categories/categories.routes.js';
import { adminCustomersRouter } from './modules/customers/customers.routes.js';
import { adminDriversRouter } from './modules/drivers/drivers.routes.js';
import { adminMerchantsRouter } from './modules/merchants/merchants.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { adminOffersRouter } from './modules/offers/offers.routes.js';
import { adminOrdersRouter } from './modules/orders/orders.admin.routes.js';
import { ordersRouter, pricingRouter } from './modules/orders/orders.routes.js';
import { adminPaymentsRouter } from './modules/payments/payments.routes.js';
import { adminPricingRulesRouter } from './modules/pricing/pricing-rules.routes.js';
import { adminProductsRouter } from './modules/products/products.routes.js';
import { adminReportsRouter } from './modules/reports/reports.routes.js';
import { adminServicesRouter, publicServicesRouter } from './modules/services/services.routes.js';
import { adminSettingsRouter } from './modules/settings/settings.routes.js';
import { uploadsRouter } from './modules/uploads/uploads.routes.js';
import { meRouter } from './modules/users/users.routes.js';
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
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // ----- static uploads -----
  app.use('/uploads', express.static(env.UPLOAD_DIR));

  // ----- health & info -----
  app.get('/health', (_req, res) => ok(res, { status: 'ok', env: env.NODE_ENV, ts: Date.now() }));
  app.get('/', (_req, res) =>
    ok(res, { name: 'Tamem Delivery API', version: '0.1.0', docs: '/api/v1/docs' }),
  );

  // ----- API v1 -----
  const v1 = express.Router();

  v1.use('/auth', authRouter);
  v1.use('/services', publicServicesRouter);
  v1.use('/categories', categoriesRouter);
  v1.use('/merchants', merchantsRouter);
  v1.use('/offers', offersRouter);
  v1.use('/me', meRouter);
  v1.use('/orders', ordersRouter);
  v1.use('/pricing', pricingRouter);
  v1.use('/uploads', uploadsRouter);
  v1.use('/notifications', notificationsRouter);

  // ----- Admin namespace -----
  const adminRouter = express.Router();
  adminRouter.use(requireAuth, requireRole(UserRole.ADMIN));
  adminRouter.use('/overview', adminOverviewRouter);
  adminRouter.use('/services', adminServicesRouter);
  adminRouter.use('/orders', adminOrdersRouter);
  adminRouter.use('/drivers', adminDriversRouter);
  adminRouter.use('/merchants', adminMerchantsRouter);
  adminRouter.use('/customers', adminCustomersRouter);
  adminRouter.use('/products', adminProductsRouter);
  adminRouter.use('/pricing-rules', adminPricingRulesRouter);
  adminRouter.use('/payments', adminPaymentsRouter);
  adminRouter.use('/alerts', adminAlertsRouter);
  adminRouter.use('/reports', adminReportsRouter);
  adminRouter.use('/settings', adminSettingsRouter);
  adminRouter.use('/categories', adminCategoriesRouter);
  adminRouter.use('/offers', adminOffersRouter);
  v1.use('/admin', adminRouter);

  app.use('/api/v1', v1);

  // ----- error handler (must be last) -----
  app.use(errorHandler);

  return app;
}
