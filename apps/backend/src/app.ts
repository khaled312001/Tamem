import compression from 'compression';
import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { corsOrigins, env, isProd } from './config/env.js';
import { adminAuditLog } from './middleware/audit.js';
import { requireAuth, requireRole } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { adminOverviewRouter } from './modules/admin/admin.routes.js';
import { adminBroadcastRouter } from './modules/admin/broadcast.routes.js';
import { adminAlertsRouter } from './modules/alerts/alerts.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import {
  categoriesRouter,
  merchantsRouter,
  offersRouter,
  productsRouter,
} from './modules/catalog/catalog.routes.js';
import { adminCategoriesRouter } from './modules/categories/categories.routes.js';
import { adminCustomersRouter } from './modules/customers/customers.routes.js';
import { adminDriversRouter } from './modules/drivers/drivers.routes.js';
import { merchantRouter } from './modules/merchant/merchant.routes.js';
import { adminMerchantsRouter } from './modules/merchants/merchants.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { adminOffersRouter } from './modules/offers/offers.routes.js';
import { adminCouponsRouter, couponsRouter } from './modules/coupons/coupons.routes.js';
import { adminOrdersRouter, adminReviewsRouter } from './modules/orders/orders.admin.routes.js';
import { adminWalletsRouter, meWalletRouter } from './modules/wallet/wallet.routes.js';
import { ordersRouter, pricingRouter } from './modules/orders/orders.routes.js';
import {
  easykashWebhookRouter,
  paymentsCustomerRouter,
  paymentsPublicRouter,
} from './modules/payments/easykash.routes.js';
import { adminPaymentsRouter } from './modules/payments/payments.routes.js';
import { promosRouter } from './modules/promos/promos.routes.js';
import { adminPricingRulesRouter } from './modules/pricing/pricing-rules.routes.js';
import { adminProductsRouter } from './modules/products/products.routes.js';
import { adminReportsRouter } from './modules/reports/reports.routes.js';
import { adminServicesRouter, publicServicesRouter } from './modules/services/services.routes.js';
import { adminSettingsRouter } from './modules/settings/settings.routes.js';
import { adminSupervisorsRouter } from './modules/supervisors/supervisors.routes.js';
import { uploadsRouter } from './modules/uploads/uploads.routes.js';
import { adminZonesRouter, publicZonesRouter } from './modules/zones/zones.routes.js';
import {
  adminHomeConfigRouter,
  publicHomeConfigRouter,
} from './modules/homeConfig/homeConfig.routes.js';
import { recurringOrdersRouter } from './modules/recurring/recurring.routes.js';
import { adminSiteRouter, publicSiteRouter } from './modules/site/site.routes.js';
import { meRouter } from './modules/users/users.routes.js';
import { whatsappRouter } from './modules/whatsapp/whatsapp.routes.js';
import { logger } from './utils/logger.js';
import { ok } from './utils/response.js';

import { UserRole } from '@tamem/types';

export function createApp(): Express {
  const app = express();

  // ----- security & infra -----
  app.set('trust proxy', 1);
  app.use(
    helmet({
      // CSP off for the API itself — the dashboard / mobile set their own
      // CSP headers at the static-server (nginx) layer. Enabling CSP here
      // would block Swagger UI's inline scripts.
      contentSecurityPolicy: false,
      // HSTS only in production — local dev runs over plain http://.
      hsts: isProd ? { maxAge: 63072000, includeSubDomains: true, preload: true } : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // CORS: in production the allowlist comes from CORS_ORIGINS (no wildcards).
  // In dev we additionally permit unknown origins so Expo Web on a random
  // port doesn't get blocked while iterating.
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true); // curl / server-to-server / mobile native
        if (corsOrigins.includes(origin)) return callback(null, true);
        if (!isProd) return callback(null, true);
        return callback(new Error(`CORS: origin not allowed: ${origin}`));
      },
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(pinoHttp({ logger }));

  // ----- rate limiting -----
  // Global ceiling first, then a tighter limit on /auth/* to slow down
  // credential stuffing. Both use the standard IETF rate-limit headers
  // so the mobile client can surface "try again in N seconds" hints.
  app.use(
    '/api/',
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
  // Auth endpoints are sensitive — tighter limit in production to slow
  // credential stuffing / signup spam. In development we relax it so QA
  // doesn't get locked out after a handful of register attempts.
  app.use(
    '/api/v1/auth',
    rateLimit({
      windowMs: 60_000,
      limit: env.NODE_ENV === 'production' ? 20 : 200,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: { code: 'TOO_MANY_REQUESTS', message: 'حاول مرة أخرى لاحقاً' } },
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
  v1.use('/products', productsRouter);
  v1.use('/offers', offersRouter);
  v1.use('/me', meRouter);
  v1.use('/orders', ordersRouter);
  v1.use('/pricing', pricingRouter);
  v1.use('/uploads', uploadsRouter);
  v1.use('/notifications', notificationsRouter);
  v1.use('/coupons', couponsRouter);
  v1.use('/me/wallet', meWalletRouter);
  v1.use('/me/recurring-orders', recurringOrdersRouter);
  v1.use('/home-config', publicHomeConfigRouter);
  v1.use('/site-config', publicSiteRouter);
  v1.use('/payments', paymentsPublicRouter);
  v1.use('/payments', paymentsCustomerRouter);
  v1.use('/payments/webhook', easykashWebhookRouter);
  v1.use('/promos', promosRouter);
  v1.use('/merchant', merchantRouter);
  v1.use('/zones', publicZonesRouter);

  // ----- Admin namespace -----
  // Order matters: requireAuth → requireRole(ADMIN) → adminAuditLog.
  // The audit middleware runs AFTER auth so it can attribute the action.
  const adminRouter = express.Router();
  adminRouter.use(requireAuth, requireRole(UserRole.ADMIN), adminAuditLog);
  adminRouter.use('/overview', adminOverviewRouter);
  adminRouter.use('/services', adminServicesRouter);
  adminRouter.use('/orders', adminOrdersRouter);
  adminRouter.use('/reviews', adminReviewsRouter);
  adminRouter.use('/coupons', adminCouponsRouter);
  adminRouter.use('/wallets', adminWalletsRouter);
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
  adminRouter.use('/home-config', adminHomeConfigRouter);
  adminRouter.use('/site-config', adminSiteRouter);
  adminRouter.use('/whatsapp', whatsappRouter);
  adminRouter.use('/broadcast', adminBroadcastRouter);
  adminRouter.use('/supervisors', adminSupervisorsRouter);
  adminRouter.use('/zones', adminZonesRouter);
  v1.use('/admin', adminRouter);

  app.use('/api/v1', v1);

  // ----- error handler (must be last) -----
  app.use(errorHandler);

  return app;
}
