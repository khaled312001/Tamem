/**
 * Every piece of data the home screen renders, in one hook.
 *
 * The queries, keys, `enabled` guards and derived values are lifted verbatim
 * from HomeScreen so V2 behaves identically. Because the query KEYS are the
 * same, React Query serves both screens from one cache entry — mounting V2
 * never issues a duplicate request.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { api } from '../../lib/api';
import { useUserLocation } from '../../lib/useUserLocation';
import { useAuth } from '../../stores/auth';

import {
  ACTIVE_STATUSES,
  type ActiveOrder,
  type HomeCategory,
  type HomeConfig,
  type Merchant,
  type Offer,
  type SavedAddress,
} from './homeData';

/**
 * Deliberately the server's maximum, not a tight radius.
 *
 * The geo branch DROPS any store outside the radius, so a small number would
 * hide real stores — a customer in Luxor would see nothing from Qift — and any
 * merchant saved without coordinates computes as thousands of km away and
 * disappears entirely. 100km keeps the list complete; distance is used for
 * labelling and sorting, not for gating.
 */
const NEARBY_RADIUS_KM = 100;

export function useHomeData() {
  const user = useAuth((s) => s.user);
  // Defer every authenticated query until the auth store has hydrated and a
  // user is present — otherwise a cold-start race fires these before the token
  // loads from secure storage and the backend rejects them with 401.
  const authReady = !!user;

  // When granted, this turns the merchant list into a *nearby* list: the
  // backend computes distanceKm server-side and we can sort and label by it.
  // Null until (and unless) it resolves — the screen never waits on it.
  const userLoc = useUserLocation(authReady);

  const offersQ = useQuery<Offer[]>({
    queryKey: ['offers'],
    queryFn: () => api.raw.get('/offers').then((r) => r.data.data),
    enabled: authReady,
    // Promotions are edited by admins, not per-minute. Matches BannerCarousel,
    // which shares this key.
    staleTime: 5 * 60_000,
  });

  // Location is part of the key: once it arrives the list is refetched with
  // distances, and the location-less result stays cached for users who never
  // grant permission.
  const merchantsQ = useQuery<{ items: Merchant[]; total: number }>({
    queryKey: ['merchants', userLoc],
    queryFn: async () => {
      const params: Record<string, number> = { pageSize: 50 };
      if (userLoc) {
        params.lat = userLoc.lat;
        params.lng = userLoc.lng;
        params.radiusKm = NEARBY_RADIUS_KM;
      }
      const r = await api.raw.get('/merchants', { params });
      return {
        items: (r.data?.data ?? []) as Merchant[],
        // Servers that predate pagination meta simply report what they sent.
        total: Number(r.data?.meta?.pagination?.total ?? (r.data?.data ?? []).length),
      };
    },
    enabled: authReady,
    // The largest payload on the home screen. Under the global 15s staleTime it
    // refetched on virtually every return to the tab.
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });

  const ordersQ = useQuery<ActiveOrder[]>({
    queryKey: ['orders-mine'],
    queryFn: () => api.raw.get('/orders/mine').then((r) => r.data.data),
    enabled: authReady,
    // Keeps the "active order" card live without a manual refresh. The socket
    // invalidates this key too, so the interval is only a fallback — and it
    // must not run while the app is backgrounded.
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const addressesQ = useQuery<SavedAddress[]>({
    queryKey: ['my-addresses'],
    queryFn: () => api.raw.get('/me/addresses').then((r) => r.data.data),
    enabled: authReady,
    // The user's own address book — changes only when they edit it.
    staleTime: 5 * 60_000,
  });

  // Same key the existing CategoriesStrip uses, so both render from one fetch.
  const categoriesQ = useQuery<HomeCategory[]>({
    queryKey: ['home-categories'],
    queryFn: () => api.raw.get('/categories').then((r) => r.data.data),
    enabled: authReady,
    // Matches CategoriesStrip, which shares this key.
    staleTime: 5 * 60_000,
  });

  const homeConfigQ = useQuery<HomeConfig>({
    queryKey: ['home-config'],
    queryFn: () => api.raw.get('/home-config').then((r) => r.data.data),
    // Admins rarely edit hourly; don't refetch on every tab switch.
    staleTime: 5 * 60_000,
    enabled: authReady,
  });

  const categories = categoriesQ.data;
  const offers = offersQ.data;
  const merchants = merchantsQ.data?.items;
  const addresses = addressesQ.data;
  const homeConfig = homeConfigQ.data;

  const defaultAddress = useMemo(
    () => (addresses ?? []).find((a) => a.isDefault) ?? addresses?.[0],
    [addresses],
  );
  const needsAddress = (addresses?.length ?? 0) === 0;

  const activeOrder = useMemo(
    () => (ordersQ.data ?? []).find((o) => ACTIVE_STATUSES.includes(o.status)),
    [ordersQ.data],
  );

  // Featured offer: if an admin pinned IDs, take the first match; else newest.
  const topOffer = useMemo(() => {
    const ids = homeConfig?.featuredOfferIds;
    if (ids && ids.length > 0) return (offers ?? []).find((o) => ids.includes(o.id)) ?? offers?.[0];
    return offers?.[0];
  }, [offers, homeConfig?.featuredOfferIds]);

  // Banner list: pinned order first, otherwise everything the API returned.
  const bannerOffers = useMemo(() => {
    const all = offers ?? [];
    const ids = homeConfig?.featuredOfferIds;
    if (!ids || ids.length === 0) return all;
    const rank = new Map(ids.map((id, i) => [id, i]));
    const pinned = all
      .filter((o) => rank.has(o.id))
      .sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    return pinned.length ? pinned : all;
  }, [offers, homeConfig?.featuredOfferIds]);

  /**
   * Every nearby store, closest first. This is the list the vertical
   * "المحلات اللي حواليك" section renders — distinct from `featuredMerchants`,
   * which is the small admin-curated rail.
   */
  const nearbyMerchants = useMemo(() => {
    const list = (merchants ?? []).slice();
    // Only meaningful once we have a fix; otherwise keep the server's order.
    if (userLoc) list.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
    return list;
  }, [merchants, userLoc]);

  // Featured merchants: admin-pinned in order > top slice.
  const featuredMerchants = useMemo(() => {
    if (!merchants) return [];
    const ids = homeConfig?.featuredMerchantIds;
    if (ids && ids.length > 0) {
      const rank = new Map(ids.map((id, i) => [id, i]));
      return merchants
        .filter((m) => rank.has(m.id))
        .sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    }
    return merchants.slice(0, 8);
  }, [merchants, homeConfig?.featuredMerchantIds]);

  // First paint only: once anything is cached we render content, not skeletons.
  const isInitialLoading =
    authReady && (merchantsQ.isLoading || offersQ.isLoading || homeConfigQ.isLoading);

  const isError = merchantsQ.isError || offersQ.isError;

  const refetchAll = () =>
    Promise.all([
      offersQ.refetch(),
      merchantsQ.refetch(),
      ordersQ.refetch(),
      addressesQ.refetch(),
      homeConfigQ.refetch(),
      categoriesQ.refetch(),
    ]);

  const isRefreshing = offersQ.isRefetching || merchantsQ.isRefetching || homeConfigQ.isRefetching;

  return {
    user,
    authReady,
    offers,
    bannerOffers,
    topOffer,
    merchants,
    featuredMerchants,
    nearbyMerchants,
    merchantsTotal: merchantsQ.data?.total ?? 0,
    hasLocation: !!userLoc,
    categories,
    loadingCategories: categoriesQ.isLoading,
    loadingMerchants: merchantsQ.isLoading,
    activeOrder,
    addresses,
    defaultAddress,
    needsAddress,
    homeConfig,
    isInitialLoading,
    isError,
    isRefreshing,
    refetchAll,
  };
}
