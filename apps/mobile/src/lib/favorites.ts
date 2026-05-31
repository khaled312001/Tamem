/**
 * Local favorites store. Persists a set of merchant IDs to AsyncStorage and
 * notifies subscribers on every change so the heart icons across the app stay
 * in sync with the Favorites screen.
 *
 * Kept device-local on purpose: no backend round-trip needed, the merchant
 * card flips instantly, and we sidestep DB schema work. If favorites grow
 * into a server-side concept (sync across devices), the API surface here
 * stays the same — only the implementation behind it changes.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const STORAGE_KEY = '@tamem/favorites_v1';

let cache: Set<string> | null = null;
const listeners = new Set<(ids: string[]) => void>();

async function load(): Promise<Set<string>> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cache = new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    cache = new Set();
  }
  return cache;
}

async function persist(set: Set<string>): Promise<void> {
  cache = set;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {
    /* ignore */
  }
  const snapshot = Array.from(set);
  listeners.forEach((fn) => fn(snapshot));
}

export async function getFavorites(): Promise<string[]> {
  const set = await load();
  return Array.from(set);
}

export async function isFavorite(merchantId: string): Promise<boolean> {
  const set = await load();
  return set.has(merchantId);
}

export async function toggleFavorite(merchantId: string): Promise<boolean> {
  const set = await load();
  const next = new Set(set);
  let added: boolean;
  if (next.has(merchantId)) {
    next.delete(merchantId);
    added = false;
  } else {
    next.add(merchantId);
    added = true;
  }
  await persist(next);
  return added;
}

export async function clearFavorites(): Promise<void> {
  await persist(new Set());
}

/**
 * Subscribe to favorites changes. Returns an unsubscribe function. Mostly
 * consumed via `useFavorite` below; exported for advanced cases.
 */
export function subscribe(fn: (ids: string[]) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Hook: returns [isFav, toggle] for a single merchant. */
export function useFavorite(merchantId: string | undefined): {
  isFavorite: boolean;
  toggle: () => Promise<boolean | undefined>;
} {
  const [fav, setFav] = useState(false);

  useEffect(() => {
    if (!merchantId) return;
    let alive = true;
    void isFavorite(merchantId).then((v) => alive && setFav(v));
    const unsub = subscribe((ids) => {
      if (alive) setFav(ids.includes(merchantId));
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [merchantId]);

  return {
    isFavorite: fav,
    toggle: async () => {
      if (!merchantId) return undefined;
      return toggleFavorite(merchantId);
    },
  };
}

/** Hook: returns the current list of favorite merchant IDs. */
export function useFavoriteIds(): string[] {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    void getFavorites().then((v) => alive && setIds(v));
    const unsub = subscribe((next) => {
      if (alive) setIds(next);
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);
  return ids;
}
