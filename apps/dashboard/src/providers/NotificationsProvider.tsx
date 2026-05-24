import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { connectSocket } from '../lib/socket.js';
import { useNotifications, type NotifKind } from '../lib/notificationsStore.js';
import { playChime } from '../lib/notifySound.js';

/**
 * Mounts once near the root and subscribes to all admin-relevant socket events
 * regardless of which page is open. Each event:
 *   1. plays a synthesized chime (info / success / alert)
 *   2. raises a toast
 *   3. fires a browser-level Notification when the tab is hidden
 *   4. appends to the inbox store so the header bell badges + dropdown work
 *   5. invalidates the relevant TanStack Query so the open page refetches
 */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const push = useNotifications((s) => s.push);

  useEffect(() => {
    // Ask once for browser notification permission (no-op if already decided)
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'default'
    ) {
      Notification.requestPermission().catch(() => undefined);
    }

    const socket = connectSocket();

    const handle = (
      kind: NotifKind,
      payload: { id?: string; orderNumber?: string; status?: string; titleAr?: string },
    ) => {
      let title = '';
      let body = '';
      let link: string | undefined;
      let chime: 'info' | 'success' | 'alert' = 'info';

      switch (kind) {
        case 'order:new':
          title = '🆕 طلب جديد';
          body = payload.orderNumber
            ? `طلب ${payload.orderNumber} ينتظر المراجعة`
            : 'طلب جديد ينتظر المراجعة';
          link = payload.id ? `/orders` : undefined;
          chime = 'alert';
          qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
          qc.invalidateQueries({ queryKey: ['admin', 'overview-counts'] });
          break;
        case 'order:status':
          title = '🔄 تحديث طلب';
          body = payload.orderNumber
            ? `طلب ${payload.orderNumber} → ${payload.status ?? 'حالة جديدة'}`
            : 'تحديث حالة طلب';
          link = `/orders`;
          chime = payload.status === 'COMPLETED' ? 'success' : 'info';
          qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
          break;
        case 'alert:new':
          title = '⚠️ تنبيه جديد';
          body = payload.titleAr ?? 'تم إضافة تنبيه إلى المركز';
          link = `/alerts`;
          chime = 'alert';
          qc.invalidateQueries({ queryKey: ['admin', 'alerts'] });
          qc.invalidateQueries({ queryKey: ['admin', 'alerts-count'] });
          break;
        case 'payment:new':
          title = '💳 إثبات دفع جديد';
          body = payload.orderNumber
            ? `طلب ${payload.orderNumber} رفع إثبات دفع`
            : 'إثبات دفع جديد ينتظر التأكيد';
          link = `/payments`;
          chime = 'success';
          qc.invalidateQueries({ queryKey: ['admin', 'payments'] });
          break;
      }

      // 1. sound
      playChime(chime);

      // 2. toast
      const toastFn = chime === 'alert' ? toast.error : chime === 'success' ? toast.success : toast;
      toastFn(title, {
        description: body,
        ...(link
          ? { action: { label: 'فتح', onClick: () => (window.location.href = link!) } }
          : {}),
      });

      // 3. browser notification when tab is hidden
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden' &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        try {
          const n = new Notification(title, { body, tag: kind, icon: '/favicon.ico' });
          n.onclick = () => {
            window.focus();
            if (link) window.location.href = link;
            n.close();
          };
        } catch {
          // ignore — some browsers throw when called from non-secure contexts
        }
      }

      // 4. inbox
      push({ kind, title, body, link, refId: payload.id });
    };

    const onNewOrder = (p: { id?: string; orderNumber?: string }) => handle('order:new', p);
    const onStatus = (p: { id?: string; orderNumber?: string; status?: string }) =>
      handle('order:status', p);
    const onAlert = (p: { id?: string; titleAr?: string }) => handle('alert:new', p);
    const onPayment = (p: { id?: string; orderNumber?: string }) => handle('payment:new', p);

    socket.on('order:new', onNewOrder);
    socket.on('order:status', onStatus);
    socket.on('alert:new', onAlert);
    socket.on('payment:new', onPayment);

    return () => {
      socket.off('order:new', onNewOrder);
      socket.off('order:status', onStatus);
      socket.off('alert:new', onAlert);
      socket.off('payment:new', onPayment);
    };
  }, [qc, push]);

  return <>{children}</>;
}
