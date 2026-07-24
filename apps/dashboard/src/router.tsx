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

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuth((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <DashboardLayout />
      </RequireAuth>
    ),
    children: [
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

// Dashboard is served from Vite's BASE_URL — locally that's `/`, in production
// it's `/super_admin/`. Router needs the same base or clicks to `/login` will
// fall off the base path onto the root domain (404).
const routerBase = (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL.replace(
  /\/$/,
  '',
);

export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter(routes, {
  basename: routerBase || undefined,
  // Opt into v7 behavior early so the deprecation warning goes away.
  // v7_startTransition wraps state updates in React.startTransition for smoother
  // navigations; safe to enable now since we're on React 18.
  // Only the two flags that are stable + supported in react-router-dom 6.28.
  // The rest (v7_fetcherPersist, v7_normalizeFormMethod, v7_partialHydration)
  // can break createBrowserRouter on routes that use React.Context consumers
  // (e.g. /merchants which loads react-leaflet) → "render2 is not a function".
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true,
  } as Record<string, boolean>,
});
