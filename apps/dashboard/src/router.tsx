import { lazy } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';

import { useAuth } from './lib/auth.js';
import { DashboardLayout } from './routes/_layout.js';
import { LoginPage } from './routes/login.js';
import { NotFoundPage } from './routes/not-found.js';

import { MerchantLoginPage } from './routes/merchant-login.js';
import { MerchantLayout } from './routes/_merchant-layout.js';

// Every page used to be imported statically, which put all 44 of them — and
// everything they pull in, recharts and leaflet included — into one 1,046 kB
// bundle that had to download before the login screen could paint. Each page is
// its own chunk now, fetched when it is first opened. <Suspense> lives around
// the <Outlet/> in both layouts.
const AdminsPage = lazy(() =>
  import('./routes/admins.js').then((m) => ({ default: m.AdminsPage })),
);
const AlertsPage = lazy(() =>
  import('./routes/alerts.js').then((m) => ({ default: m.AlertsPage })),
);
const BroadcastPage = lazy(() =>
  import('./routes/broadcast.js').then((m) => ({ default: m.BroadcastPage })),
);
const CategoriesPage = lazy(() =>
  import('./routes/categories.js').then((m) => ({ default: m.CategoriesPage })),
);
const CouponsPage = lazy(() =>
  import('./routes/coupons.js').then((m) => ({ default: m.CouponsPage })),
);
const CustomersPage = lazy(() =>
  import('./routes/customers.js').then((m) => ({ default: m.CustomersPage })),
);
const DealsPage = lazy(() => import('./routes/deals.js').then((m) => ({ default: m.DealsPage })));
const DriversPage = lazy(() =>
  import('./routes/drivers.js').then((m) => ({ default: m.DriversPage })),
);
const GatePage = lazy(() => import('./routes/gate.js').then((m) => ({ default: m.GatePage })));
const AppContentPage = lazy(() =>
  import('./routes/app-content.js').then((m) => ({ default: m.AppContentPage })),
);
const HomeSettingsPage = lazy(() =>
  import('./routes/home-settings.js').then((m) => ({ default: m.HomeSettingsPage })),
);
const ImportHistoryPage = lazy(() =>
  import('./routes/import-history.js').then((m) => ({ default: m.ImportHistoryPage })),
);
const IntercityRatesPage = lazy(() =>
  import('./routes/intercity-rates.js').then((m) => ({ default: m.IntercityRatesPage })),
);
const MerchantHoursPage = lazy(() =>
  import('./routes/merchant-hours.js').then((m) => ({ default: m.MerchantHoursPage })),
);
const MerchantPanelPage = lazy(() =>
  import('./routes/merchant-panel.js').then((m) => ({ default: m.MerchantPanelPage })),
);
const MerchantProductsApiPage = lazy(() =>
  import('./routes/merchant-products-api.js').then((m) => ({ default: m.MerchantProductsApiPage })),
);
const MerchantRequestsPage = lazy(() =>
  import('./routes/merchant-requests.js').then((m) => ({ default: m.MerchantRequestsPage })),
);
const MerchantsPage = lazy(() =>
  import('./routes/merchants.js').then((m) => ({ default: m.MerchantsPage })),
);
const NotificationTemplatesPage = lazy(() =>
  import('./routes/notification-templates.js').then((m) => ({
    default: m.NotificationTemplatesPage,
  })),
);
const OrderDetailPage = lazy(() =>
  import('./routes/order-detail.js').then((m) => ({ default: m.OrderDetailPage })),
);
const OrdersPage = lazy(() =>
  import('./routes/orders.js').then((m) => ({ default: m.OrdersPage })),
);
const OverviewPage = lazy(() =>
  import('./routes/overview.js').then((m) => ({ default: m.OverviewPage })),
);
const PartnerSettlementPage = lazy(() =>
  import('./routes/partner-settlement.js').then((m) => ({ default: m.PartnerSettlementPage })),
);
const PaymentGatewayPage = lazy(() =>
  import('./routes/payment-gateway.js').then((m) => ({ default: m.PaymentGatewayPage })),
);
const PaymentsPage = lazy(() =>
  import('./routes/payments.js').then((m) => ({ default: m.PaymentsPage })),
);
const PricingPage = lazy(() =>
  import('./routes/pricing.js').then((m) => ({ default: m.PricingPage })),
);
const ProductSectionsPage = lazy(() =>
  import('./routes/product-sections.js').then((m) => ({ default: m.ProductSectionsPage })),
);
const ProductsPage = lazy(() =>
  import('./routes/products.js').then((m) => ({ default: m.ProductsPage })),
);
const PromosPage = lazy(() =>
  import('./routes/promos.js').then((m) => ({ default: m.PromosPage })),
);
const ReportsPage = lazy(() =>
  import('./routes/reports.js').then((m) => ({ default: m.ReportsPage })),
);
const RevenueReportPage = lazy(() =>
  import('./routes/revenue-report.js').then((m) => ({ default: m.RevenueReportPage })),
);
const ReviewsPage = lazy(() =>
  import('./routes/reviews.js').then((m) => ({ default: m.ReviewsPage })),
);
const ServiceEditPage = lazy(() =>
  import('./routes/service-edit.js').then((m) => ({ default: m.ServiceEditPage })),
);
const ServicesPage = lazy(() =>
  import('./routes/services.js').then((m) => ({ default: m.ServicesPage })),
);
const SettingsPage = lazy(() =>
  import('./routes/settings.js').then((m) => ({ default: m.SettingsPage })),
);
const SiteSettingsPage = lazy(() =>
  import('./routes/site-settings.js').then((m) => ({ default: m.SiteSettingsPage })),
);
const SupervisorsPage = lazy(() =>
  import('./routes/supervisors.js').then((m) => ({ default: m.SupervisorsPage })),
);
const WhatsAppPage = lazy(() =>
  import('./routes/whatsapp.js').then((m) => ({ default: m.WhatsAppPage })),
);
const TelegramPage = lazy(() =>
  import('./routes/telegram.js').then((m) => ({ default: m.TelegramPage })),
);

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
  // Private partner-revenue report. Standalone on purpose: no admin auth, no
  // sidebar, no permission — gated only by the passphrase the backend checks.
  { path: '/partner', element: <PartnerSettlementPage /> },
  // باب المالك: /k/<الرمز> يفتح الداشبورد على طول، و/k من غير رمز بيسأل عنه.
  // منفصل عن /login بالكامل — ده لينك تاني، مش تعديل على الأول.
  { path: '/k', element: <GatePage /> },
  { path: '/k/:code', element: <GatePage /> },
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
          { path: 'merchant-requests', element: <MerchantRequestsPage /> },
          { path: 'deals', element: <DealsPage /> },
          { path: 'products/import-history', element: <ImportHistoryPage /> },
          { path: 'pricing', element: <PricingPage /> },
          { path: 'pricing/intercity', element: <IntercityRatesPage /> },
          { path: 'payments', element: <PaymentsPage /> },
          { path: 'payment-gateway', element: <PaymentGatewayPage /> },
          { path: 'reports', element: <ReportsPage /> },
          { path: 'reports/revenue', element: <RevenueReportPage /> },
          { path: 'reviews', element: <ReviewsPage /> },
          { path: 'alerts', element: <AlertsPage /> },
          { path: 'whatsapp', element: <WhatsAppPage /> },
          { path: 'whatsapp/templates', element: <NotificationTemplatesPage /> },
          { path: 'telegram', element: <TelegramPage /> },
          { path: 'broadcast', element: <BroadcastPage /> },
          { path: 'supervisors', element: <SupervisorsPage /> },
          { path: 'admins', element: <AdminsPage /> },
          { path: 'coupons', element: <CouponsPage /> },
          { path: 'promos', element: <PromosPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'home-settings', element: <HomeSettingsPage /> },
          { path: 'app-content', element: <AppContentPage /> },
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
