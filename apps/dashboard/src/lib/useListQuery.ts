/**
 * List-screen helpers shared by every table page.
 *
 * `useDebounced` keeps a fast-typing search box from firing a request per
 * keystroke — the query key only changes once typing settles, and react-query
 * drops the in-flight response for a stale key, so no extra round-trips.
 *
 * `useListState` keeps page / pageSize / search / filters in the URL query
 * string. That makes the list state survive opening a row and pressing back,
 * and makes a filtered view shareable — without any global store.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Value that only updates after `delay` ms of no changes. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export interface ListState {
  page: number;
  pageSize: number;
  /** Raw input value — bind this to the search box. */
  search: string;
  /** Debounced copy — send THIS to the API / query key. */
  debouncedSearch: string;
  setSearch: (v: string) => void;
  setPage: (p: number) => void;
  setPageSize: (s: number) => void;
  /** Any extra filter, e.g. get('status'). Empty string when unset. */
  get: (key: string) => string;
  /** Set a filter (empty string removes it). Always resets to page 1. */
  set: (key: string, value: string) => void;
  /** Set several filters in ONE navigation (empty string removes a key). Use
   *  this instead of calling `set` multiple times in one handler — react-router
   *  does NOT chain sequential setSearchParams calls, so the later ones clobber
   *  the earlier ones and the filter silently doesn't apply. Resets to page 1. */
  setMany: (patch: Record<string, string>) => void;
  /** Clear search + every extra filter, back to page 1. */
  reset: () => void;
  /** True when at least one filter/search is active. */
  isFiltered: boolean;
}

/**
 * URL-backed list state. `extraKeys` are the filter names this screen uses, so
 * `reset()` and `isFiltered` know what to clear/count.
 */
export function useListState(extraKeys: string[] = [], defaultPageSize = 20): ListState {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const pageSize = Number(params.get('pageSize') ?? defaultPageSize) || defaultPageSize;
  const urlSearch = params.get('q') ?? '';

  // Local mirror so typing stays responsive; the URL follows the debounced value.
  const [search, setSearchLocal] = useState(urlSearch);
  const debouncedSearch = useDebounced(search, 300);

  // Keep the URL in sync with the settled search term (and reset to page 1).
  const lastPushed = useRef(urlSearch);
  useEffect(() => {
    if (debouncedSearch === lastPushed.current) return;
    lastPushed.current = debouncedSearch;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (debouncedSearch) next.set('q', debouncedSearch);
        else next.delete('q');
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  }, [debouncedSearch, setParams]);

  // Back-navigation restores a different ?q= — adopt it.
  useEffect(() => {
    if (urlSearch !== lastPushed.current) {
      lastPushed.current = urlSearch;
      setSearchLocal(urlSearch);
    }
  }, [urlSearch]);

  const patch = (fn: (n: URLSearchParams) => void, resetPage = true) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        fn(next);
        if (resetPage) next.delete('page');
        return next;
      },
      { replace: true },
    );

  const isFiltered = useMemo(
    () => Boolean(debouncedSearch) || extraKeys.some((k) => (params.get(k) ?? '') !== ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [debouncedSearch, params, extraKeys.join(',')],
  );

  return {
    page,
    pageSize,
    search,
    debouncedSearch,
    setSearch: setSearchLocal,
    setPage: (p) => patch((n) => (p <= 1 ? n.delete('page') : n.set('page', String(p))), false),
    setPageSize: (s) => patch((n) => n.set('pageSize', String(s))),
    get: (key) => params.get(key) ?? '',
    set: (key, value) => patch((n) => (value ? n.set(key, value) : n.delete(key))),
    setMany: (obj) =>
      patch((n) => {
        for (const [k, v] of Object.entries(obj)) {
          if (v) n.set(k, v);
          else n.delete(k);
        }
      }),
    reset: () => {
      setSearchLocal('');
      lastPushed.current = '';
      patch((n) => {
        n.delete('q');
        extraKeys.forEach((k) => n.delete(k));
      });
    },
    isFiltered,
  };
}
