import { QueryClient } from '@tanstack/react-query';

/**
 * Defaults tuned for an always-open admin dashboard on shared hosting.
 *
 * IMPORTANT: the shared MySQL user is capped at 500 DB connections/hour, and
 * the PHP shim opens one connection per request. A global 30 s poll + refetch
 * on every window focus can burn that entire budget while idling on a single
 * page. So we deliberately keep background polling gentle and drop the
 * focus-burst; data is still fresh within ~1–2 min and any page navigation or
 * manual refresh pulls the latest immediately. Individual queries that truly
 * need faster updates (e.g. the orders board) can override refetchInterval.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchInterval: 120_000,
      refetchIntervalInBackground: false,
      staleTime: 60_000,
    },
  },
});
