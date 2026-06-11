import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  Box,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  CreditCard,
  DollarSign,
  Globe,
  Home,
  Menu,
  MessageCircle,
  Package,
  Settings,
  Smartphone,
  Sparkles,
  Store,
  Tag,
  Truck,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { Logo } from '../components/Logo.js';
import { NotificationBell } from '../components/NotificationBell.js';
import { UserMenu } from '../components/UserMenu.js';
import { api } from '../lib/api.js';
import { isSoundEnabled, playNewOrderSound, setSoundEnabled } from '../lib/sound.js';
import { useSocketStatus } from '../lib/useSocketStatus.js';
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
  { to: '/coupons', icon: Tag, label: 'الكوبونات' },
  { to: '/reports', icon: BarChart3, label: 'التقارير' },
  { to: '/reports/revenue', icon: BarChart3, label: 'تقرير الإيرادات' },
  { to: '/whatsapp', icon: MessageCircle, label: 'ربط واتساب' },
  { to: '/home-settings', icon: Smartphone, label: 'صفحة التطبيق' },
  { to: '/site-settings', icon: Globe, label: 'صفحة الموقع' },
  { to: '/settings', icon: Settings, label: 'الإعدادات' },
];

const ACTIVE_LABEL: Record<string, string> = Object.fromEntries(
  NAV_ITEMS.map((n) => [n.to, n.label]),
);

export function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  // Sidebar state: on mobile it overlays; on desktop it can be either
  // wide (full labels + icons) or collapsed (icons only with tooltips).
  // The collapsed choice persists across sessions so muscle memory holds.
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('tamem-sidebar-collapsed') === '1';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('tamem-sidebar-collapsed', collapsed ? '1' : '0');
  }, [collapsed]);
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

        {/* Sidebar — collapsible (icons-only) on desktop, off-canvas on mobile.
            Width transitions smoothly between 256px and 80px; nav items hide
            their labels in the narrow mode and reveal them as native title
            tooltips on hover. */}
        <aside
          className={cn(
            'fixed md:sticky top-0 inset-y-0 right-0 z-50 h-screen',
            'flex flex-col bg-white/95 backdrop-blur-xl border-l border-border/70',
            'shadow-[0_0_40px_-20px_rgba(224,48,30,0.25)]',
            'transition-[width,transform] duration-300 ease-out',
            mobileOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0',
            collapsed ? 'w-72 md:w-20' : 'w-72 md:w-64',
          )}
        >
          {/* Brand header — when collapsed we shrink the logo + drop the
              "لوحة التحكم" subtitle so it doesn't overflow the 80px width. */}
          <div className="relative p-3 border-b border-border/60">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-red via-brand-gold to-brand-orange" />
            <div className="flex items-start justify-between gap-2">
              <div
                className={cn(
                  'flex-1 flex flex-col items-center transition-all',
                  collapsed && 'md:py-1',
                )}
              >
                <div className="relative">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-brand-red/10 via-brand-orange/5 to-transparent blur-xl" />
                  <Logo
                    className={cn(
                      'relative w-auto drop-shadow-md transition-all duration-300',
                      collapsed ? 'h-10 md:h-12' : 'h-24',
                    )}
                  />
                </div>
                {!collapsed && (
                  <div className="mt-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-bold">
                    لوحة التحكم
                  </div>
                )}
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="md:hidden p-1 rounded hover:bg-muted"
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Collapse / expand toggle — desktop only. The button hangs
                off the left edge of the sidebar like a tab so the user
                always sees it even when the sidebar is at minimum width. */}
            <button
              onClick={() => setCollapsed((c) => !c)}
              className={cn(
                'hidden md:flex absolute -left-3 top-7',
                'w-7 h-7 rounded-full bg-white border border-border shadow-md',
                'items-center justify-center text-foreground/70',
                'hover:bg-brand-red hover:text-white hover:border-brand-red hover:scale-110',
                'transition-all duration-200',
              )}
              aria-label={collapsed ? 'فتح الشريط الجانبي' : 'طي الشريط الجانبي'}
              title={collapsed ? 'فتح الشريط الجانبي' : 'طي الشريط الجانبي'}
            >
              {collapsed ? (
                <ChevronsLeft className="w-3.5 h-3.5" />
              ) : (
                <ChevronsRight className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          <nav
            className={cn(
              'flex-1 p-3 space-y-0.5 overflow-y-auto custom-scrollbar',
              collapsed && 'md:px-2',
            )}
          >
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    'group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm overflow-hidden',
                    'transition-all duration-200',
                    collapsed ? 'md:justify-center md:px-2' : 'justify-between',
                    isActive
                      ? 'text-white font-bold shadow-lg shadow-brand-red/30'
                      : 'text-foreground/80 hover:text-foreground hover:bg-brand-red/5',
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
                    <span
                      className={cn(
                        'relative flex items-center gap-3',
                        collapsed && 'md:justify-center',
                      )}
                    >
                      <item.icon
                        className={cn(
                          'w-4 h-4 transition-transform duration-200',
                          isActive ? 'scale-110' : 'group-hover:scale-110',
                          collapsed && 'md:w-5 md:h-5',
                        )}
                      />
                      <span className={cn(collapsed && 'md:hidden')}>{item.label}</span>
                    </span>
                    {item.countKey && counts[item.countKey] > 0 && (
                      <span
                        className={cn(
                          'relative min-w-[1.4rem] h-[1.4rem] px-1.5 inline-flex items-center justify-center rounded-full text-[10px] font-black',
                          collapsed &&
                            'md:absolute md:-top-1 md:-right-1 md:min-w-[1.1rem] md:h-[1.1rem] md:px-1 md:text-[9px]',
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
              <SocketIndicator />
              <SoundToggle />
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
                  <img
                    src="/barmagly-logo.jpg"
                    alt="برمجلي"
                    className="w-4 h-4 rounded object-cover"
                  />
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

// ────────────────────────────────────────────────────────────────────────────
// Header indicators
// ────────────────────────────────────────────────────────────────────────────

function SocketIndicator() {
  const status = useSocketStatus();
  const meta = {
    connected: { color: 'bg-green-500', label: 'متصل', ringClass: 'ring-green-300' },
    reconnecting: {
      color: 'bg-amber-400',
      label: 'جاري إعادة الاتصال',
      ringClass: 'ring-amber-300 animate-pulse',
    },
    connecting: {
      color: 'bg-amber-400',
      label: 'جاري الاتصال',
      ringClass: 'ring-amber-300 animate-pulse',
    },
    disconnected: { color: 'bg-red-500', label: 'غير متصل', ringClass: 'ring-red-300' },
  }[status];

  return (
    <div
      className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground select-none"
      title={`الاتصال اللحظي: ${meta.label}`}
    >
      <span className={`w-2.5 h-2.5 rounded-full ${meta.color} ring-2 ${meta.ringClass}`} />
      <span className="hidden lg:inline">{meta.label}</span>
    </div>
  );
}

function SoundToggle() {
  const [on, setOn] = useState(isSoundEnabled());
  const toggle = () => {
    const next = !on;
    setOn(next);
    setSoundEnabled(next);
    // Audible feedback the first time it's flipped on so the admin knows it works.
    if (next) playNewOrderSound();
  };
  return (
    <button
      onClick={toggle}
      title={on ? 'كتم تنبيهات الصوت' : 'تفعيل تنبيهات الصوت'}
      className={`p-2 rounded-lg transition ${
        on ? 'text-brand-red hover:bg-brand-red/10' : 'text-muted-foreground hover:bg-muted'
      }`}
    >
      {on ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
    </button>
  );
}
