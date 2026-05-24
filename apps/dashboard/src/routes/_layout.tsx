import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  Box,
  ChevronLeft,
  CreditCard,
  DollarSign,
  Home,
  Menu,
  MessageCircle,
  Package,
  Settings,
  Sparkles,
  Store,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { Logo } from '../components/Logo.js';
import { NotificationBell } from '../components/NotificationBell.js';
import { UserMenu } from '../components/UserMenu.js';
import { api } from '../lib/api.js';
import { cn } from '../lib/utils.js';
import { NotificationsProvider } from '../providers/NotificationsProvider.js';

type NavItem = {
  to: string;
  icon: typeof Home;
  label: string;
  countKey?: 'orders' | 'alerts';
  urgent?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { to: '/overview', icon: Home, label: 'نظرة عامة' },
  { to: '/orders', icon: Package, label: 'الطلبات', countKey: 'orders' },
  { to: '/alerts', icon: AlertTriangle, label: 'التنبيهات', countKey: 'alerts', urgent: true },
  { to: '/customers', icon: Users, label: 'العملاء' },
  { to: '/drivers', icon: Truck, label: 'السائقون' },
  { to: '/merchants', icon: Store, label: 'التجار' },
  { to: '/services', icon: Sparkles, label: 'الخدمات' },
  { to: '/products', icon: Box, label: 'المنتجات' },
  { to: '/pricing', icon: DollarSign, label: 'التسعير' },
  { to: '/payments', icon: DollarSign, label: 'المدفوعات' },
  { to: '/payment-gateway', icon: CreditCard, label: 'بوابة الدفع' },
  { to: '/reports', icon: BarChart3, label: 'التقارير' },
  { to: '/whatsapp', icon: MessageCircle, label: 'ربط واتساب' },
  { to: '/settings', icon: Settings, label: 'الإعدادات' },
];

const ACTIVE_LABEL: Record<string, string> = Object.fromEntries(
  NAV_ITEMS.map((n) => [n.to, n.label]),
);

export function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  // Sidebar state: on desktop it's always open; on mobile it overlays.
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchValue.trim();
    if (!q) return;
    navigate(`/orders?search=${encodeURIComponent(q)}`);
  };
  // Auto-close the drawer when navigating between pages
  useEffect(() => setMobileOpen(false), [location.pathname]);
  // Lock scroll while the overlay is up
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  // Live counts for sidebar badges
  const { data: overview } = useQuery({
    queryKey: ['admin', 'overview-counts'],
    queryFn: () => api.adminOverview() as Promise<{ openOrders?: number }>,
  });
  const { data: alertsData } = useQuery({
    queryKey: ['admin', 'alerts-count'],
    queryFn: () => api.adminListAlerts({ resolved: 'false' }),
  });
  const counts = {
    orders: overview?.openOrders ?? 0,
    alerts: alertsData?.alerts?.length ?? 0,
  };

  const pageTitle =
    Object.entries(ACTIVE_LABEL).find(([to]) => location.pathname.startsWith(to))?.[1] ??
    'لوحة التحكم';

  return (
    <NotificationsProvider>
      <div className="min-h-screen flex bg-gradient-to-br from-[#fdf6f4] via-white to-[#fff8f3]">
        {/* Mobile overlay backdrop */}
        {mobileOpen && (
          <button
            aria-label="إغلاق القائمة"
            onClick={() => setMobileOpen(false)}
            className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          />
        )}

        {/* Sidebar — gradient brand strip + glass-morphic backdrop */}
        <aside
          className={cn(
            'fixed md:sticky top-0 inset-y-0 right-0 z-50 h-screen',
            'w-72 md:w-64 flex flex-col',
            'bg-white/90 backdrop-blur-xl border-l border-border/70',
            'shadow-[0_0_40px_-20px_rgba(224,48,30,0.25)]',
            'transition-transform duration-300 ease-out',
            mobileOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0',
          )}
        >
          {/* Brand header with subtle gradient bar */}
          <div className="relative p-5 border-b border-border/60">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-red via-brand-gold to-brand-orange" />
            <div className="flex items-start justify-between">
              <div className="flex-1 flex flex-col items-center">
                <div className="relative">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-brand-red/10 via-brand-orange/5 to-transparent blur-xl" />
                  <Logo className="relative h-24 w-auto drop-shadow-md" />
                </div>
                <div className="mt-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-bold">
                  لوحة التحكم
                </div>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="md:hidden p-1 rounded hover:bg-muted"
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto custom-scrollbar">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'group relative flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm overflow-hidden',
                    'transition-all duration-200',
                    isActive
                      ? 'text-white font-bold shadow-lg shadow-brand-red/30'
                      : 'text-foreground/80 hover:text-foreground hover:bg-brand-red/5 hover:translate-x-[-2px]',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute inset-0 bg-gradient-to-l from-brand-red via-[#d12818] to-brand-orange" />
                    )}
                    {isActive && (
                      <span className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-l-full bg-white/80" />
                    )}
                    <span className="relative flex items-center gap-3">
                      <item.icon
                        className={cn(
                          'w-4 h-4 transition-transform duration-200',
                          isActive ? 'scale-110' : 'group-hover:scale-110',
                        )}
                      />
                      {item.label}
                    </span>
                    {item.countKey && counts[item.countKey] > 0 && (
                      <span
                        className={cn(
                          'relative min-w-[1.4rem] h-[1.4rem] px-1.5 inline-flex items-center justify-center rounded-full text-[10px] font-black',
                          isActive
                            ? 'bg-white/25 text-white'
                            : item.urgent
                              ? 'bg-destructive text-white animate-pulse shadow-md shadow-destructive/40'
                              : 'bg-foreground/10 text-foreground',
                        )}
                      >
                        {counts[item.countKey]}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-30 h-14 md:h-16 bg-white/80 backdrop-blur-xl border-b border-border/60 shadow-sm flex items-center justify-between px-3 md:px-6 gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => setMobileOpen((o) => !o)}
                className="md:hidden p-2 -ml-2 hover:bg-muted rounded-lg transition"
                aria-label="فتح القائمة"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2 min-w-0">
                <ChevronLeft className="w-4 h-4 text-brand-red/60 hidden sm:block" />
                <h2 className="font-black text-base md:text-lg truncate bg-gradient-to-l from-brand-dark to-brand-red bg-clip-text text-transparent">
                  {pageTitle}
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <form onSubmit={submitSearch} className="hidden md:block relative">
                <input
                  type="search"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder="ابحث برقم الطلب أو اسم العميل... (Enter)"
                  className="w-56 lg:w-72 px-4 py-2 rounded-full bg-gradient-to-l from-muted/70 to-muted/40 border border-transparent outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red/30 focus:bg-white text-sm transition-all duration-200"
                />
              </form>
              <NotificationBell />
              <div className="w-px h-8 bg-border/60 hidden md:block" />
              <UserMenu />
            </div>
          </header>

          <div className="flex-1 overflow-y-auto flex flex-col">
            <div className="flex-1 p-3 md:p-6 animate-in fade-in slide-in-from-bottom-1 duration-300">
              <Outlet />
            </div>

            {/* Main-content footer — version + Barmagly credit (compact) */}
            <footer className="mt-4 border-t border-border/60">
              <div className="px-4 md:px-6 py-2 flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">تميم للتوصيل</span>
                  <span className="opacity-50">·</span>
                  <span className="font-mono opacity-70">v0.1.0</span>
                  <span className="opacity-50">·</span>
                  <span className="opacity-70">© 2026</span>
                </div>

                <a
                  href="http://barmagly.tech/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 hover:text-brand-red transition"
                  title="تطوير وتنفيذ شركة برمجلي"
                >
                  <span className="w-4 h-4 rounded bg-gradient-to-br from-brand-red to-brand-orange grid place-items-center text-white font-black text-[8px]">
                    ب
                  </span>
                  <span>
                    تطوير <span className="font-bold">شركة برمجلي</span>
                  </span>
                </a>
              </div>
            </footer>
          </div>
        </main>
      </div>
    </NotificationsProvider>
  );
}
