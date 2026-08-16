/**
 * Offline support: keep the app readable with no connection.
 *
 * Most customers here are on patchy mobile data — inside a shop, in a village
 * with one bar. Before this, losing signal emptied the app: TanStack Query's
 * cache lived in memory only, was garbage-collected after five minutes, and did
 * not survive the app being closed. Reopening on a dead connection gave blank
 * lists and spinners, so the catalogue they had been reading a minute ago was
 * simply gone.
 *
 * Three pieces make it work, and all three are needed:
 *
 *   1. `onlineManager` actually knows. App.tsx used to hardcode
 *      `setOnline(true)` with the comment "NetInfo isn't a dependency", so the
 *      app always believed it had a connection: offline queries went to the
 *      network, failed, and retried instead of serving what was already known.
 *   2. The cache is written to AsyncStorage and restored on launch, so what was
 *      on screen yesterday is on screen today with the radio off.
 *   3. `networkMode: 'offlineFirst'` — run the query, and if the network is not
 *      there, keep the cached data rather than throwing.
 *
 * What is deliberately NOT offline: placing an order. See `blockedOffline`.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { onlineManager } from '@tanstack/react-query';

import { showToast } from './toast';

/** How long restored data stays usable before it is discarded as too old. */
export const OFFLINE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Queries whose contents are worth keeping on disk.
 *
 * Everything the customer READS is persisted. The exclusions are things that
 * are either meaningless later or actively wrong to show from a week ago:
 *
 *   - `payments-config` is a live switch; a stale copy could offer a payment
 *     method that has since been turned off.
 *   - zone quotes are prices for one basket at one address. Re-quoting is the
 *     whole reason the intercity fix exists — a remembered 20 for a basket that
 *     now costs 90 is the exact bug that was fixed.
 */
const NEVER_PERSIST = ['payments-config', 'zones'];

/**
 * Typed structurally rather than with `Query` from @tanstack/react-query: the
 * install resolves two copies of query-core (one nested under react-query, one
 * hoisted), and the two `Query` classes are not assignable to each other even
 * though they are the same code. Naming only what this reads keeps it honest
 * and immune to which copy wins.
 */
interface PersistableQuery {
  queryKey: readonly unknown[];
  state: { status: string };
}

export function shouldPersistQuery(query: PersistableQuery): boolean {
  const head = query.queryKey?.[0];
  if (typeof head === 'string' && NEVER_PERSIST.includes(head)) return false;
  // Never keep a failure. Restoring an error state means the screen opens
  // showing "تعذّر التحميل" from last week instead of trying.
  return query.state.status === 'success';
}

export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'TAMEM_QUERY_CACHE_V1',
  // Batch writes: the cache is rewritten on every query settle, and on a low-end
  // Android that is a lot of JSON serialisation on the JS thread.
  throttleTime: 2000,
});

/**
 * Point TanStack's online flag at the real radio.
 *
 * `isInternetReachable` is deliberately preferred over `isConnected`: Wi-Fi
 * that is joined but has no route out — a café portal, a router with no
 * upstream — reports connected while nothing can load, which is precisely when
 * the customer needs the cached screens. It is null until the first probe
 * resolves, and we treat that as online so a cold start is not spent offline.
 */
export function startNetworkWatcher(): void {
  onlineManager.setEventListener((setOnline) => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const reachable = state.isInternetReachable;
      setOnline(reachable === null ? !!state.isConnected : !!reachable);
    });
    return unsubscribe;
  });
}

/**
 * True when an action must not be attempted right now.
 *
 * Reads come from cache offline; WRITES must not be queued. A delivery order
 * is priced from live tariffs, live stock and whether the shop is open — the
 * app has been careful about all three — so replaying one from a queue an hour
 * later could confirm a basket at a price nobody agreed to, from a shop that
 * has closed. The customer is told to try again instead, which is honest and
 * costs nobody money.
 */
export function blockedOffline(): boolean {
  return !onlineManager.isOnline();
}

/**
 * Guard for every "send this order" button: refuses and explains, in one line
 * at the call site.
 *
 * Returns true when the caller should stop. The message is identical in all
 * four order flows on purpose — the customer should not learn a different story
 * about the same connection depending on which screen they happened to use.
 */
export function refuseIfOffline(): boolean {
  if (!blockedOffline()) return false;
  showToast({
    title: 'مفيش إنترنت',
    message: 'الطلب محتاج اتصال عشان نأكد السعر والمتاح. جرّب تاني لما النت يرجع.',
    tone: 'error',
  });
  return true;
}
