import {
  AlertTriangle,
  BarChart3,
  Bell,
  Box,
  DollarSign,
  Home,
  LogOut,
  Package,
  Settings,
  Sparkles,
  Store,
  Truck,
  Users,
} from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { useAuth } from '../lib/auth.js';
import { cn } from '../lib/utils.js';

const NAV_ITEMS = [
  { to: '/overview', icon: Home, label: 'نظرة عامة' },
  { to: '/orders', icon: Package, label: 'الطلبات', badge: 14 },
  { to: '/alerts', icon: AlertTriangle, label: 'التنبيهات', badge: 9, urgent: true },
  { to: '/customers', icon: Users, label: 'العملاء' },
  { to: '/drivers', icon: Truck, label: 'السائقون' },
  { to: '/merchants', icon: Store, label: 'التجار' },
  { to: '/services', icon: Sparkles, label: 'الخدمات' },
  { to: '/products', icon: Box, label: 'المنتجات' },
  { to: '/pricing', icon: DollarSign, label: 'التسعير' },
  { to: '/payments', icon: DollarSign, label: 'المدفوعات' },
  { to: '/reports', icon: BarChart3, label: 'التقارير' },
  { to: '/settings', icon: Settings, label: 'الإعدادات' },
] as const;

export function DashboardLayout() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const clear = useAuth((s) => s.clear);

  const onLogout = () => {
    clear();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex bg-muted/30">
      {/* Sidebar — appears on the right in RTL */}
      <aside className="w-64 bg-white border-l border-border flex flex-col">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-red flex items-center justify-center">
              <span className="text-white font-black text-xl">ت</span>
            </div>
            <div>
              <div className="font-black text-brand-dark">تميم</div>
              <div className="text-xs text-muted-foreground">لوحة التحكم</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg transition text-sm',
                  isActive ? 'bg-brand-red text-white font-bold' : 'text-foreground hover:bg-muted',
                )
              }
            >
              <span className="flex items-center gap-3">
                <item.icon className="w-4 h-4" />
                {item.label}
              </span>
              {'badge' in item && item.badge && (
                <span
                  className={cn(
                    'min-w-[1.5rem] h-6 px-1.5 inline-flex items-center justify-center rounded-full text-xs font-bold',
                    'urgent' in item && item.urgent
                      ? 'bg-destructive text-white'
                      : 'bg-muted text-foreground',
                  )}
                >
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-border">
          <div className="px-3 py-2 text-sm mb-2">
            <div className="font-bold">{user?.name ?? 'مستخدم'}</div>
            <div className="text-xs text-muted-foreground">{user?.role}</div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition"
          >
            <LogOut className="w-4 h-4" />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-border flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <input
              type="search"
              placeholder="بحث..."
              className="w-64 px-4 py-2 rounded-lg bg-muted border-0 outline-none focus:ring-2 focus:ring-brand-red/20 text-sm"
            />
          </div>
          <div className="flex items-center gap-3">
            <button className="relative p-2 hover:bg-muted rounded-lg">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 left-1 w-2 h-2 bg-destructive rounded-full" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
