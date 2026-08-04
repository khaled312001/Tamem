/**
 * Favorites store — saved stores ('merchant') + a product wishlist ('product').
 *
 * Local-first for an instant heart, offline use, and guests — but for a
 * signed-in user the SERVER is the source of truth (GET/POST/DELETE
 * /me/favorites), so favourites survive a reinstall / new device and sync
 * across them. On sign-in the two are reconciled (server ∪ anything saved while
 * logged out); on sign-out the local mirror is dropped so the next user on a
 * shared phone doesn't inherit them.
 *
 * The exported API surface is unchanged — callers (HeartButton, FavoritesScreen)
 * don't know or care whether a favourite lives on disk or on the server.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { api } from './api';
import { useAuth } from '../stores/auth';

export type FavoriteCollection = 'merchant' | 'product';

const STORAGE_KEYS: Record<FavoriteCollection, string> = {
  merchant: '@tamem/favorites_v1', // pre-existing key for backwards compat
  product: '@tamem/wishlist_v1',
};
const COLLECTIONS: FavoriteCollection[] = ['merchant', 'product'];

interface CollectionState {
  cache: Set<string> | null;
  listeners: Set<(ids: string[]) => void>;
}

const state: Record<FavoriteCollection, CollectionState> = {
  merchant: { cache: null, listeners: new Set() },
  product: { cache: null, listeners: new Set() },
};

// Pull the server copy once per signed-in session; re-armed on every auth change.
let pulled = false;
let syncing: Promise<void> | null = null;

function isAuthed(): boolean {
  return !!useAuth.getState().tokens?.accessToken;
}

async function loadLocal(collection: FavoriteCollection): Promise<Set<string>> {
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

async function persistLocal(collection: FavoriteCollection, set: Set<string>): Promise<void> {
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

// ── Server sync — all best-effort: a network failure never breaks the heart ──

async function serverAdd(collection: FavoriteCollection, id: string): Promise<void> {
  try {
    await api.raw.post('/me/favorites', { collection, targetId: id });
  } catch {
    /* offline — local copy stands, reconciled on next sync */
  }
}

async function serverRemove(collection: FavoriteCollection, id: string): Promise<void> {
  try {
    await api.raw.delete('/me/favorites', { data: { collection, targetId: id } });
  } catch {
    /* offline */
  }
}

/**
 * Reconcile local ⟷ server: pull the server set, union it with anything saved
 * locally (e.g. favourited before signing in), and push those local-only ids up
 * so both sides converge. De-duped so concurrent callers share one round-trip.
 */
export function syncFavoritesWithServer(): Promise<void> {
  if (!isAuthed()) return Promise.resolve();
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      const res = await api.raw.get('/me/favorites');
      const data = (res.data?.data ?? {}) as Record<string, Array<{ id: string }>>;
      const localOnly: Record<FavoriteCollection, string[]> = { merchant: [], product: [] };
      for (const c of COLLECTIONS) {
        const serverIds = new Set((data[c] ?? []).map((x) => x.id));
        const local = await loadLocal(c);
        localOnly[c] = Array.from(local).filter((id) => !serverIds.has(id));
        await persistLocal(c, new Set([...serverIds, ...local]));
      }
      if (localOnly.merchant.length || localOnly.product.length) {
        try {
          await api.raw.post('/me/favorites/merge', localOnly);
        } catch {
          /* offline */
        }
      }
      pulled = true;
    } catch {
      /* stay on the local copy */
    }
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

/** Drop the local mirror on sign-out so the next user doesn't inherit favourites. */
export async function resetLocalFavorites(): Promise<void> {
  pulled = false;
  for (const c of COLLECTIONS) {
    state[c].cache = new Set();
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS[c]);
    } catch {
      /* ignore */
    }
    state[c].listeners.forEach((fn) => fn([]));
  }
}

// React to auth transitions: sign-in → reconcile, sign-out → reset.
let wasAuthed = isAuthed();
useAuth.subscribe((s) => {
  const authed = !!s.tokens?.accessToken;
  if (authed && !wasAuthed) {
    pulled = false;
    void syncFavoritesWithServer();
  } else if (!authed && wasAuthed) {
    void resetLocalFavorites();
  }
  wasAuthed = authed;
});

// ── Generic API ─────────────────────────────────────────────────────────────

export async function getFavoritesOf(collection: FavoriteCollection): Promise<string[]> {
  const set = await loadLocal(collection);
  // First read while signed in pulls the server copy in the background; the
  // hooks below re-render when the merged set lands.
  if (isAuthed() && !pulled) void syncFavoritesWithServer();
  return Array.from(set);
}

export async function isFavoriteIn(collection: FavoriteCollection, id: string): Promise<boolean> {
  const set = await loadLocal(collection);
  return set.has(id);
}

export async function toggleFavoriteIn(
  collection: FavoriteCollection,
  id: string,
): Promise<boolean> {
  const set = await loadLocal(collection);
  const next = new Set(set);
  let added: boolean;
  if (next.has(id)) {
    next.delete(id);
    added = false;
  } else {
    next.add(id);
    added = true;
  }
  await persistLocal(collection, next);
  // Instant local flip; the server call trails behind and is reconciled later.
  if (isAuthed()) void (added ? serverAdd(collection, id) : serverRemove(collection, id));
  return added;
}

export async function clearFavoritesOf(collection: FavoriteCollection): Promise<void> {
  await persistLocal(collection, new Set());
  if (isAuthed()) {
    try {
      await api.raw.delete('/me/favorites', { data: { collection, all: true } });
    } catch {
      /* offline */
    }
  }
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
