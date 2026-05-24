import { ChevronDown, LogOut, Settings, User as UserIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../lib/auth.js';

/**
 * Header user chip + dropdown. Lives in the top bar so the sidebar gets back
 * the vertical space it used to spend on the profile card.
 *
 * Dropdown actions:
 *   - حسابي  → /settings (Account tab)
 *   - بوابة الدفع → /payment-gateway
 *   - تسجيل الخروج → clears auth + redirects to /login
 */
export function UserMenu() {
  const user = useAuth((s) => s.user);
  const clear = useAuth((s) => s.clear);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const onLogout = () => {
    clear();
    setOpen(false);
    navigate('/login');
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-2 p-1 pe-2 rounded-full hover:bg-muted/60 transition group"
        aria-label="حساب المستخدم"
      >
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-red to-brand-orange grid place-items-center text-white font-black text-sm shadow-md shadow-brand-red/30">
          {user?.name?.charAt(0) ?? 'ت'}
        </div>
        <div className="hidden md:flex flex-col items-end leading-tight">
          <span className="text-sm font-bold truncate max-w-[8rem]">{user?.name ?? 'مستخدم'}</span>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            {user?.role ?? 'GUEST'}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground hidden md:block transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-60 bg-white rounded-xl border border-border shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-4 py-3 border-b border-border bg-gradient-to-l from-brand-red/5 to-transparent">
            <div className="font-bold text-sm">{user?.name ?? 'مستخدم'}</div>
            <div className="text-xs text-muted-foreground">{user?.phone ?? ''}</div>
          </div>
          <div className="py-1">
            <MenuItem icon={<UserIcon className="w-4 h-4" />} onClick={() => go('/settings')}>
              حسابي
            </MenuItem>
            <MenuItem icon={<Settings className="w-4 h-4" />} onClick={() => go('/settings')}>
              الإعدادات
            </MenuItem>
          </div>
          <div className="border-t border-border py-1">
            <MenuItem icon={<LogOut className="w-4 h-4" />} danger onClick={onLogout}>
              تسجيل الخروج
            </MenuItem>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  children,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-right flex items-center gap-3 px-4 py-2.5 text-sm transition ${
        danger ? 'text-destructive hover:bg-destructive/10 font-bold' : 'hover:bg-muted/60'
      }`}
    >
      <span className={danger ? 'text-destructive' : 'text-muted-foreground'}>{icon}</span>
      {children}
    </button>
  );
}
