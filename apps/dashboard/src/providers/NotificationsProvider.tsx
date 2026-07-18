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
      // The dashboard is served under a base path (/super_admin). A bare
      // `window.location.href = '/alerts'` ignores that base and 404s at the
      // domain root — so prefix the app's BASE_URL.
      const base = (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL.replace(
        /\/$/,
        '',
      );
      toastFn(title, {
        description: body,
        ...(link
          ? { action: { label: 'فتح', onClick: () => (window.location.href = base + link!) } }
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
 * Socket-free notifications. Since production has no WebSocket, this is the ONLY
 * source of live updates — so it must actually fire while the admin is on
 * another tab, and fast enough to feel live.
 *
 * One /admin/realtime poll every 15s returns just what's new since the last
 * tick (orders + alerts + counts), so it stays under the shared-hosting
 * connection cap even though it runs in the BACKGROUND (the old 60s foreground-
 * only poll meant a new order raised nothing unless you were staring at the
 * tab). A per-id seen-set makes a double-poll impossible to double-notify, and
 * the first tick just seeds the baseline so a refresh never replays old items.
 */
function usePollingFallback(
  notify: (
    kind: NotifKind,
    payload: { id?: string; orderNumber?: string; status?: string; titleAr?: string },
  ) => void,
) {
  const qc = useQueryClient();
  const sinceRef = useRef<number | undefined>(undefined);
  const seededRef = useRef(false);
  const seen = useRef<Set<string>>(new Set());

  const { data } = useQuery({
    queryKey: ['admin', 'realtime'],
    queryFn: () => api.adminRealtime(sinceRef.current),
    enabled: SOCKET_DISABLED,
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
    gcTime: 60_000,
  });

  useEffect(() => {
    if (!data) return;
    sinceRef.current = data.now ?? Date.now();

    // First tick = baseline. Record what already exists without notifying.
    if (!seededRef.current) {
      seededRef.current = true;
      for (const o of data.orders ?? []) seen.current.add('o:' + o.id);
      for (const a of data.alerts ?? []) seen.current.add('a:' + a.id);
      return;
    }

    let fired = false;
    for (const o of data.orders ?? []) {
      const key = 'o:' + o.id;
      if (seen.current.has(key)) continue;
      seen.current.add(key);
      fired = true;
      if (o.status === 'NEW' || o.status === 'UNDER_REVIEW') {
        notify('order:new', { id: o.id, orderNumber: o.orderNumber });
      } else {
        notify('order:status', { id: o.id, orderNumber: o.orderNumber, status: o.status });
      }
    }
    for (const a of data.alerts ?? []) {
      const key = 'a:' + a.id;
      if (seen.current.has(key)) continue;
      seen.current.add(key);
      fired = true;
      notify('alert:new', { id: a.id, titleAr: a.titleAr });
    }

    // Keep the sidebar badges in sync without a second request.
    if (fired) {
      qc.invalidateQueries({ queryKey: ['admin', 'overview-counts'] });
      qc.invalidateQueries({ queryKey: ['admin', 'alerts-count'] });
    }
    // Bound the seen-set so a long-lived tab can't grow it forever.
    if (seen.current.size > 500) {
      seen.current = new Set([...seen.current].slice(-250));
    }
  }, [data, notify, qc]);
}
