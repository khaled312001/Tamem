import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { api } from '../lib/api.js';
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
const SOCKET_DISABLED = import.meta.env.VITE_DISABLE_SOCKET === 'true';

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const push = useNotifications((s) => s.push);

  /** Single delivery path — socket events and the polling fallback both land
   *  here, so the two can never present differently. */
  const notify = useCallback(
    (
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
    },
    [qc, push],
  );

  useEffect(() => {
    // NB: do NOT auto-request Notification permission here. Chrome blocks
    // sites that prompt without a user gesture and emits a noisy console
    // warning. We ask only when the admin clicks the bell for the first time
    // (see NotificationBell.tsx) — that's a real gesture.

    const socket = connectSocket();

    const handle = notify;

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

  // No-op while the socket is live; the only source of notifications while it
  // isn't — which is production today.
  usePollingFallback(notify);

  return <>{children}</>;
}
/**
 * Socket-free notifications. Watches for alerts and new orders and fires the
 * same notify() the socket would have.
 *
 * Deliberately seeded on first load rather than notifying: without this, every
 * page refresh would replay every open alert as if it had just happened.
 */
function usePollingFallback(
  notify: (
    kind: NotifKind,
    payload: { id?: string; orderNumber?: string; status?: string; titleAr?: string },
  ) => void,
) {
  const seenAlerts = useRef<Set<string> | null>(null);
  const seenOrders = useRef<Set<string> | null>(null);

  // Same key + fetcher as the sidebar badge, so React Query serves both from
  // one request instead of doubling the load.
  const { data: alertsData } = useQuery({
    queryKey: ['admin', 'alerts-count'],
    queryFn: () => api.adminListAlerts({ resolved: 'false' }),
    enabled: SOCKET_DISABLED,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const { data: ordersData } = useQuery({
    queryKey: ['admin', 'notif-orders'],
    queryFn: () => api.adminListOrders({ status: 'NEW', pageSize: 10 }),
    enabled: SOCKET_DISABLED,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    const list = (alertsData as { alerts?: { id: string; titleAr?: string }[] } | undefined)
      ?.alerts;
    if (!list) return;
    const ids = new Set(list.map((a) => String(a.id)));
    if (seenAlerts.current === null) {
      seenAlerts.current = ids; // first load = baseline, not news
      return;
    }
    for (const a of list) {
      if (!seenAlerts.current.has(String(a.id))) {
        notify('alert:new', { id: String(a.id), titleAr: a.titleAr });
      }
    }
    seenAlerts.current = ids;
  }, [alertsData, notify]);

  useEffect(() => {
    const list = (ordersData as { items?: { id: string; orderNumber?: string }[] } | undefined)
      ?.items;
    if (!list) return;
    const ids = new Set(list.map((o) => String(o.id)));
    if (seenOrders.current === null) {
      seenOrders.current = ids;
      return;
    }
    for (const o of list) {
      if (!seenOrders.current.has(String(o.id))) {
        notify('order:new', { id: String(o.id), orderNumber: o.orderNumber });
      }
    }
    seenOrders.current = ids;
  }, [ordersData, notify]);
}
