import { Box, LogOut, Menu, Store, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';

import { Logo } from '../components/Logo.js';
import { useAuth } from '../lib/auth.js';
import { cn } from '../lib/utils.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MerchantProfile = any;

function getMerchantProfile(): MerchantProfile | null {
  try {
    const raw = sessionStorage.getItem('tamem-merchant-profile');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function MerchantLayout() {
  const user = useAuth((s) => s.user);
  const clear = useAuth((s) => s.clear);
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const profile = getMerchantProfile();

  // Redirect non-merchants to the merchant login
  if (!user) return <Navigate to="/merchant-login" replace />;
  if ((user as { role?: string }).role !== 'MERCHANT') {
    return <Navigate to="/merchant-login" replace />;
  }

  // Auto-close on navigation
  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const storeName = profile?.storeNameAr || profile?.storeName || user.name || 'متجري';

  const handleLogout = () => {
    sessionStorage.removeItem('tamem-merchant-profile');
    clear();
    window.location.href = '/merchant';
  };

  const navItems = [{ to: '/merchant', icon: Box, label: 'إدارة المنتجات' }];

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile overlay */}
      {mobileOpen && (
        <button
          aria-label="إغلاق القائمة"
          onClick={() => setMobileOpen(false)}
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed md:sticky top-0 h-screen z-50 flex flex-col transition-all duration-300',
          'w-[260px] bg-brand-dark text-white shadow-xl',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
        dir="rtl"
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-red flex items-center justify-center shadow-md">
            <Store className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-black truncate text-white">{storeName}</h2>
            <p className="text-[11px] text-white/60 font-medium">لوحة تحكم التاجر</p>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-1 rounded-lg hover:bg-white/10 transition"
          >
            <X className="w-5 h-5 text-white/70" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200',
                  isActive
                    ? 'bg-brand-red text-white shadow-md'
                    : 'text-white/70 hover:text-white hover:bg-white/10',
                )
              }
            >
              <item.icon className="w-5 h-5 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Logout button */}
        <div className="p-3 border-t border-white/10">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-bold text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all duration-200"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            <span>تسجيل الخروج</span>
          </button>
        </div>

        {/* Brand Footer */}
        <div className="p-4 flex justify-center border-t border-white/5">
          <Logo className="h-6 opacity-40" />
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top Header */}
        <header className="sticky top-0 z-30 backdrop-blur-xl bg-card/80 border-b border-border px-4 md:px-6 h-16 flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden p-2 rounded-xl hover:bg-muted transition"
          >
            <Menu className="w-5 h-5 text-foreground" />
          </button>

          <div className="flex-1">
            <h1 className="text-lg font-black text-foreground">لوحة تحكم المتجر</h1>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <div className="w-9 h-9 rounded-xl bg-brand-red flex items-center justify-center text-white text-xs font-bold shadow-sm">
              {storeName[0]}
            </div>
            <span className="hidden sm:block text-foreground font-bold">{storeName}</span>
          </div>
        </header>

        {/* Page Container */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto bg-muted/20">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
