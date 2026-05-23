import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';

import { DashboardLayout } from './routes/_layout.js';
import { LoginPage } from './routes/login.js';
import { OverviewPage } from './routes/overview.js';
import { useAuth } from './lib/auth.js';

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
      // Placeholders — to be implemented in Phase 2/3:
      { path: 'orders', element: <PlaceholderPage title="إدارة الطلبات" /> },
      { path: 'orders/:id', element: <PlaceholderPage title="تفاصيل الطلب" /> },
      { path: 'customers', element: <PlaceholderPage title="العملاء" /> },
      { path: 'drivers', element: <PlaceholderPage title="السائقون" /> },
      { path: 'merchants', element: <PlaceholderPage title="التجار" /> },
      { path: 'services', element: <PlaceholderPage title="الخدمات" /> },
      { path: 'services/new', element: <PlaceholderPage title="إضافة خدمة" /> },
      { path: 'services/:id/edit', element: <PlaceholderPage title="تعديل خدمة" /> },
      { path: 'products', element: <PlaceholderPage title="المنتجات" /> },
      { path: 'pricing', element: <PlaceholderPage title="التسعير" /> },
      { path: 'payments', element: <PlaceholderPage title="المدفوعات" /> },
      { path: 'reports', element: <PlaceholderPage title="التقارير" /> },
      { path: 'alerts', element: <PlaceholderPage title="مركز التنبيهات" /> },
      { path: 'settings', element: <PlaceholderPage title="الإعدادات" /> },
    ],
  },
];

export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter(routes);

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-black text-brand-red">{title}</h1>
        <p className="mt-2 text-muted-foreground">قيد التنفيذ — هذه الشاشة هيكل أولي.</p>
      </div>
    </div>
  );
}
