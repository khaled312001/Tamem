/**
 * Unread-notification count, shared by the tab-bar bell and the home header.
 *
 * Both call sites use the same query key, so React Query serves them from one
 * cache entry — mounting the second consumer costs no extra request.
 *
 * The socket drives freshness; the interval is only a safety net for a dropped
 * connection. This used to poll 100 rows every 60s from the tab bar, i.e. on
 * every screen for the whole session, purely to produce one integer.
 *
 * `pageSize` is capped at 100 server-side and there is no unread-only filter,
 * so a user with more than 100 unread items still under-counts. Fixing that
 * properly needs a `/notifications/unread-count` endpoint.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './api';
import { useSocketEvents } from './useSocketEvents';

/** Module-level so the array identity never changes across renders. */
const BADGE_EVENTS = ['notification:new', 'order:new', 'order:status'];

export function useUnreadCount(): number {
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      try {
        const r = await api.raw.get('/notifications', { params: { pageSize: 100 } });
        const list = (r.data.data ?? []) as Array<{ isRead?: boolean }>;
        return list.filter((n) => !n.isRead).length;
      } catch {
        return 0;
      }
    },
    refetchInterval: 10 * 60_000,
    refetchIntervalInBackground: false,
    staleTime: 60_000,
  });

  useSocketEvents(BADGE_EVENTS, () => {
    void qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
  });

  return data ?? 0;
}
