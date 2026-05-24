import { Bell, Trash2, VolumeX, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useNotifications } from '../lib/notificationsStore.js';
import { isSoundEnabled, setSoundEnabled } from '../lib/notifySound.js';
import { cn } from '../lib/utils.js';

function timeAgo(at: number): string {
  const sec = Math.floor((Date.now() - at) / 1000);
  if (sec < 60) return 'الآن';
  if (sec < 3600) return `قبل ${Math.floor(sec / 60)} د`;
  if (sec < 86400) return `قبل ${Math.floor(sec / 3600)} س`;
  return new Date(at).toLocaleString('ar-EG');
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const ref = useRef<HTMLDivElement>(null);
  const items = useNotifications((s) => s.items);
  const unread = useNotifications((s) => s.unreadCount);
  const markAllRead = useNotifications((s) => s.markAllRead);
  const remove = useNotifications((s) => s.remove);
  const clear = useNotifications((s) => s.clear);
  const navigate = useNavigate();

  // close on outside click
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // mark read when opened
  useEffect(() => {
    if (open && unread > 0) {
      const t = setTimeout(() => markAllRead(), 800);
      return () => clearTimeout(t);
    }
  }, [open, unread, markAllRead]);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundEnabled(next);
    setSoundOn(next);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          // Use this real user gesture as the moment to ask for browser
          // notification permission — Chrome only allows the prompt during
          // a user-initiated event.
          if (
            typeof window !== 'undefined' &&
            'Notification' in window &&
            Notification.permission === 'default'
          ) {
            Notification.requestPermission().catch(() => undefined);
          }
          setOpen((o) => !o);
        }}
        className="relative p-2 hover:bg-muted rounded-lg"
        aria-label="الإشعارات"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 inline-flex items-center justify-center rounded-full bg-destructive text-white text-[10px] font-bold">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-96 bg-white rounded-xl border border-border shadow-2xl overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="font-bold">الإشعارات</div>
            <div className="flex items-center gap-1">
              <button
                onClick={toggleSound}
                className="p-1.5 hover:bg-muted rounded-md text-muted-foreground"
                title={soundOn ? 'إيقاف الصوت' : 'تفعيل الصوت'}
              >
                {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              {items.length > 0 && (
                <button
                  onClick={clear}
                  className="p-1.5 hover:bg-muted rounded-md text-muted-foreground"
                  title="مسح الكل"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                لا توجد إشعارات
                <div className="text-xs mt-1">هنوصلك بأي حدث جديد لحظة حدوثه</div>
              </div>
            ) : (
              items.map((it) => (
                <button
                  key={it.id}
                  onClick={() => {
                    if (it.link) navigate(it.link);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full text-right px-4 py-3 hover:bg-muted/50 border-b border-border/50 flex gap-3 items-start group transition',
                    !it.read && 'bg-brand-red/5',
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold">{it.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">{it.body}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">{timeAgo(it.at)}</div>
                  </div>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(it.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        remove(it.id);
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 transition p-1 cursor-pointer hover:bg-muted rounded"
                    aria-label="حذف"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
