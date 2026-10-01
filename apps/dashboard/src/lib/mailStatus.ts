import { useQuery } from '@tanstack/react-query';

import { api } from './api.js';

/**
 * Whether the server sends email at all (MAIL_ENABLED on the API, off by
 * default: the mailbox allows 100 sends a day).
 *
 * The order screens use it so the confirm summary doesn't tell the agent —
 * who repeats it to a customer on the phone — that the order is being
 * emailed when the server is going to drop it. Anything but an explicit
 * `true` (still loading, an older API without the route) reads as off,
 * because off is the default.
 */
export function useMailEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ['mail-status'],
    queryFn: () =>
      api.raw
        .get('/admin/mail-status')
        .then((r) => (r.data?.data as { enabled?: boolean } | undefined)?.enabled === true),
    staleTime: 5 * 60_000,
  });
  return data === true;
}
