import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';

import { useAuth } from './lib/auth.js';
import { DashboardLayout } from './routes/_layout.js';
import { AdminsPage } from './routes/admins.js';
import { AlertsPage } from './routes/alerts.js';
import { BroadcastPage } from './routes/broadcast.js';
import { CustomersPage } from './routes/customers.js';
import { DriversPage } from './routes/drivers.js';
import { HomeSettingsPage } from './routes/home-settings.js';
import { LoginPage } from './routes/login.js';
import { MerchantHoursPage } from './routes/merchant-hours.js';
import { MerchantProductsApiPage } from './routes/merchant-products-api.js';
import { MerchantsPage } from './routes/merchants.js';
import { NotFoundPage } from './routes/not-found.js';
import { OrderDetailPage } from './routes/order-detail.js';
import { OrdersPage } from './routes/orders.js';
import { OverviewPage } from './routes/overview.js';
import { PaymentGatewayPage } from './routes/payment-gateway.js';
import { PaymentsPage } from './routes/payments.js';
import { PricingPage } from './routes/pricing.js';
import { CategoriesPage } from './routes/categories.js';
import { ProductSectionsPage } from './routes/product-sections.js';
import { DealsPage } from './routes/deals.js';
import { ImportHistoryPage } from './routes/import-history.js';
import { ProductsPage } from './routes/products.js';
import { ReportsPage } from './routes/reports.js';
import { RevenueReportPage } from './routes/revenue-report.js';
import { ReviewsPage } from './routes/reviews.js';
import { ServiceEditPage } from './routes/service-edit.js';
import { ServicesPage } from './routes/services.js';
import { SiteSettingsPage } from './routes/site-settings.js';
import { CouponsPage } from './routes/coupons.js';
import { SettingsPage } from './routes/settings.js';
import { SupervisorsPage } from './routes/supervisors.js';
import { NotificationTemplatesPage } from './routes/notification-templates.js';
import { WhatsAppPage } from './routes/whatsapp.js';

import { MerchantLoginPage } from './routes/merchant-login.js';
import { MerchantLayout } from './routes/_merchant-layout.js';
import { MerchantPanelPage } from './routes/merchant-panel.js';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuth((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  // A merchant has no business on the admin pages: the API answers 403 for every
  // /admin/* call, so without this they'd land on a shell full of error toasts.
  // Send them to their own panel instead. (The real boundary is server-side.)
  if ((user as { role?: string }).role === 'MERCHANT') return <Navigate to="/merchant" replace />;
  return <>{children}</>;
}

function MerchantWrapper() {
  const user = useAuth((s) => s.user);
  if (!user || (user as { role?: string }).role !== 'MERCHANT') {
    return <MerchantLoginPage />;
  }
  return <MerchantLayout />;
}

const isMerchantSite =
  typeof window !== 'undefined' && window.location.pathname.startsWith('/merchant');

const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/merchant-login', element: <MerchantLoginPage /> },
  {
    path: '/merchant',
    element: <MerchantWrapper />,
    children: [
      { index: true, element: <MerchantPanelPage /> },
      { path: '*', element: <MerchantPanelPage /> },
    ],
  },
  {
    path: '/merchant-panel',
    element: <MerchantWrapper />,
    children: [
      { index: true, element: <MerchantPanelPage /> },
      { path: '*', element: <MerchantPanelPage /> },
    ],
  },
  {
    path: '/',
    element: isMerchantSite ? (
      <MerchantWrapper />
    ) : (
      <RequireAuth>
        <DashboardLayout />
      </RequireAuth>
    ),
    children: isMerchantSite
      ? [
          { index: true, element: <MerchantPanelPage /> },
          { path: '*', element: <MerchantPanelPage /> },
        ]
      : [
          { index: true, element: <Navigate to="/overview" replace /> },
          { path: 'overview', element: <OverviewPage /> },
          { path: 'orders', element: <OrdersPage /> },
          { path: 'orders/:id', element: <OrderDetailPage /> },
          { path: 'customers', element: <CustomersPage /> },
          { path: 'drivers', element: <DriversPage /> },
          { path: 'merchants', element: <MerchantsPage /> },
          { path: 'merchants/:id/hours', element: <MerchantHoursPage /> },
          { path: 'merchants/:id/products-api', element: <MerchantProductsApiPage /> },
          { path: 'services', element: <ServicesPage /> },
          { path: 'services/new', element: <ServiceEditPage /> },
          { path: 'services/:id/edit', element: <ServiceEditPage /> },
          { path: 'products', element: <ProductsPage /> },
          { path: 'categories', element: <CategoriesPage /> },
          { path: 'product-sections', element: <ProductSectionsPage /> },
          { path: 'deals', element: <DealsPage /> },
          { path: 'products/import-history', element: <ImportHistoryPage /> },
          { path: 'pricing', element: <PricingPage /> },
          { path: 'payments', element: <PaymentsPage /> },
          { path: 'payment-gateway', element: <PaymentGatewayPage /> },
          { path: 'reports', element: <ReportsPage /> },
          { path: 'reports/revenue', element: <RevenueReportPage /> },
          { path: 'reviews', element: <ReviewsPage /> },
          { path: 'alerts', element: <AlertsPage /> },
          { path: 'whatsapp', element: <WhatsAppPage /> },
          { path: 'whatsapp/templates', element: <NotificationTemplatesPage /> },
          { path: 'broadcast', element: <BroadcastPage /> },
          { path: 'supervisors', element: <SupervisorsPage /> },
          { path: 'admins', element: <AdminsPage /> },
          { path: 'coupons', element: <CouponsPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'home-settings', element: <HomeSettingsPage /> },
          { path: 'site-settings', element: <SiteSettingsPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
  },
];

function getRouterBase(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const p = window.location.pathname;
  if (p.startsWith('/merchant')) return '/merchant';
  if (p.startsWith('/super_admin')) return '/super_admin';
  const base = (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL.replace(
    /\/$/,
    '',
  );
  return base || undefined;
}

export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter(routes, {
  basename: getRouterBase(),
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true,
  } as Record<string, boolean>,
});
