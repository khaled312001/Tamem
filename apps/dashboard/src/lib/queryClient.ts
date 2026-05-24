import { QueryClient } from '@tanstack/react-query';

/**
 * Defaults tuned for an always-open admin dashboard:
 *   - data is considered fresh for 15 s, so quick tab-switches don't re-fetch
 *   - polls every 30 s in the background so nothing rots if a socket event
 *     gets dropped or the connection blips
 *   - refetches on window focus so coming back to the tab grabs the latest
 *   - the NotificationsProvider invalidates the relevant keys on socket events,
 *     so the perceived update is near-instant — these defaults are the safety net
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      staleTime: 15_000,
    },
  },
});
