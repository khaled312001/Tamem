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

export function useHomeData() {
  const user = useAuth((s) => s.user);
  // Defer every authenticated query until the auth store has hydrated and a
  // user is present — otherwise a cold-start race fires these before the token
  // loads from secure storage and the backend rejects them with 401.
  const authReady = !!user;

  const offersQ = useQuery<Offer[]>({
    queryKey: ['offers'],
    queryFn: () => api.raw.get('/offers').then((r) => r.data.data),
    enabled: authReady,
  });

  const merchantsQ = useQuery<Merchant[]>({
    queryKey: ['merchants'],
    queryFn: () => api.raw.get('/merchants').then((r) => r.data.data),
    enabled: authReady,
  });

  const ordersQ = useQuery<ActiveOrder[]>({
    queryKey: ['orders-mine'],
    queryFn: () => api.raw.get('/orders/mine').then((r) => r.data.data),
    enabled: authReady,
    // Keeps the "active order" card live without a manual refresh.
    refetchInterval: 30_000,
  });

  const addressesQ = useQuery<SavedAddress[]>({
    queryKey: ['my-addresses'],
    queryFn: () => api.raw.get('/me/addresses').then((r) => r.data.data),
    enabled: authReady,
  });

  // Same key the existing CategoriesStrip uses, so both render from one fetch.
  const categoriesQ = useQuery<HomeCategory[]>({
    queryKey: ['home-categories'],
    queryFn: () => api.raw.get('/categories').then((r) => r.data.data),
    enabled: authReady,
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
  const merchants = merchantsQ.data;
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
