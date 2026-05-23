import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';

import { useAuth } from './lib/auth.js';
import { DashboardLayout } from './routes/_layout.js';
import { AlertsPage } from './routes/alerts.js';
import { CustomersPage } from './routes/customers.js';
import { DriversPage } from './routes/drivers.js';
import { LoginPage } from './routes/login.js';
import { MerchantsPage } from './routes/merchants.js';
import { NotFoundPage } from './routes/not-found.js';
import { OrdersPage } from './routes/orders.js';
import { OverviewPage } from './routes/overview.js';
import { PaymentsPage } from './routes/payments.js';
import { PricingPage } from './routes/pricing.js';
import { ProductsPage } from './routes/products.js';
import { ReportsPage } from './routes/reports.js';
import { ServiceEditPage } from './routes/service-edit.js';
import { ServicesPage } from './routes/services.js';
import { SettingsPage } from './routes/settings.js';

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
      { path: 'customers', element: <CustomersPage /> },
      { path: 'drivers', element: <DriversPage /> },
      { path: 'merchants', element: <MerchantsPage /> },
      { path: 'services', element: <ServicesPage /> },
      { path: 'services/new', element: <ServiceEditPage /> },
      { path: 'services/:id/edit', element: <ServiceEditPage /> },
      { path: 'products', element: <ProductsPage /> },
      { path: 'pricing', element: <PricingPage /> },
      { path: 'payments', element: <PaymentsPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'alerts', element: <AlertsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter(routes);
