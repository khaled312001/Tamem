import { useQuery } from '@tanstack/react-query';

import { api } from './api.js';

export interface NotifyStatus {
  /** MAIL_ENABLED on the API — off by default (the mailbox allows 100/day). */
  email: boolean;
  /** WA_CUSTOMER_ORDER_MSGS — order updates on WhatsApp to the customer. Off
   *  by default: they go to the group, the customer follows in the app. */
  whatsappCustomer: boolean;
}

/**
 * Which customer-facing channels the server actually uses.
 *
 * The order screens use it so the confirm summary doesn't tell the agent —
 * who repeats it to a customer on the phone — that a message is on its way
 * when the server is going to drop it. Anything but an explicit `true`
 * (still loading, an older API without the route) reads as off, because off
 * is the default for both.
 */
export function useNotifyStatus(): NotifyStatus {
  const { data } = useQuery({
    queryKey: ['notify-status'],
    queryFn: () =>
      api.raw
        .get('/admin/notify-status')
        .then((r) => (r.data?.data ?? {}) as Partial<Record<keyof NotifyStatus, unknown>>),
    staleTime: 5 * 60_000,
  });
  return { email: data?.email === true, whatsappCustomer: data?.whatsappCustomer === true };
}
