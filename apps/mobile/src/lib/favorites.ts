/**
 * Local favorites store. Persists a set of IDs to AsyncStorage and notifies
 * subscribers on every change so the heart icons across the app stay in sync
 * with the Favorites screen.
 *
 * Two collections: 'merchant' (stores you saved) and 'product' (items you
 * saved for later — a real wishlist). Same API surface for both via the
 * `collection` argument; legacy merchant-only helpers still work.
 *
 * Kept device-local on purpose: no backend round-trip needed, the heart flips
 * instantly, and we sidestep DB schema work. If favorites grow into a
 * server-side concept (sync across devices), the API surface here stays the
 * same — only the implementation behind it changes.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export type FavoriteCollection = 'merchant' | 'product';

const STORAGE_KEYS: Record<FavoriteCollection, string> = {
  merchant: '@tamem/favorites_v1', // pre-existing key for backwards compat
  product: '@tamem/wishlist_v1',
};

interface CollectionState {
  cache: Set<string> | null;
  listeners: Set<(ids: string[]) => void>;
}

const state: Record<FavoriteCollection, CollectionState> = {
  merchant: { cache: null, listeners: new Set() },
  product: { cache: null, listeners: new Set() },
};

async function load(collection: FavoriteCollection): Promise<Set<string>> {
  const s = state[collection];
  if (s.cache) return s.cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS[collection]);
    s.cache = new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    s.cache = new Set();
  }
  return s.cache;
}

async function persist(collection: FavoriteCollection, set: Set<string>): Promise<void> {
  const s = state[collection];
  s.cache = set;
  try {
    await AsyncStorage.setItem(STORAGE_KEYS[collection], JSON.stringify(Array.from(set)));
  } catch {
    /* ignore */
  }
  const snapshot = Array.from(set);
  s.listeners.forEach((fn) => fn(snapshot));
}

// ── Generic API ─────────────────────────────────────────────────────────────

export async function getFavoritesOf(collection: FavoriteCollection): Promise<string[]> {
  const set = await load(collection);
  return Array.from(set);
}

export async function isFavoriteIn(collection: FavoriteCollection, id: string): Promise<boolean> {
  const set = await load(collection);
  return set.has(id);
}

export async function toggleFavoriteIn(
  collection: FavoriteCollection,
  id: string,
): Promise<boolean> {
  const set = await load(collection);
  const next = new Set(set);
  let added: boolean;
  if (next.has(id)) {
    next.delete(id);
    added = false;
  } else {
    next.add(id);
    added = true;
  }
  await persist(collection, next);
  return added;
}

export async function clearFavoritesOf(collection: FavoriteCollection): Promise<void> {
  await persist(collection, new Set());
}

export function subscribeTo(
  collection: FavoriteCollection,
  fn: (ids: string[]) => void,
): () => void {
  state[collection].listeners.add(fn);
  return () => state[collection].listeners.delete(fn);
}

/**
 * Generic React hook — returns [isFav, toggle] for an item in any collection.
 */
export function useFavoriteItem(
  collection: FavoriteCollection,
  id: string | undefined,
): {
  isFavorite: boolean;
  toggle: () => Promise<boolean | undefined>;
} {
  const [fav, setFav] = useState(false);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    void isFavoriteIn(collection, id).then((v) => alive && setFav(v));
    const unsub = subscribeTo(collection, (ids) => {
      if (alive) setFav(ids.includes(id));
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [collection, id]);

  return {
    isFavorite: fav,
    toggle: async () => {
      if (!id) return undefined;
      return toggleFavoriteIn(collection, id);
    },
  };
}

export function useFavoriteIdsOf(collection: FavoriteCollection): string[] {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    void getFavoritesOf(collection).then((v) => alive && setIds(v));
    const unsub = subscribeTo(collection, (next) => {
      if (alive) setIds(next);
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [collection]);
  return ids;
}

// ── Backwards-compatible merchant-only helpers (used by HeartButton +
//    FavoritesScreen). New code should prefer the generic API above.
// ────────────────────────────────────────────────────────────────────────────
export const getFavorites = (): Promise<string[]> => getFavoritesOf('merchant');
export const isFavorite = (id: string): Promise<boolean> => isFavoriteIn('merchant', id);
export const toggleFavorite = (id: string): Promise<boolean> => toggleFavoriteIn('merchant', id);
export const clearFavorites = (): Promise<void> => clearFavoritesOf('merchant');
export const subscribe = (fn: (ids: string[]) => void): (() => void) => subscribeTo('merchant', fn);

export function useFavorite(merchantId: string | undefined) {
  return useFavoriteItem('merchant', merchantId);
}

export function useFavoriteIds(): string[] {
  return useFavoriteIdsOf('merchant');
}
