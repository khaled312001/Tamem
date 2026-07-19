/**
 * Returns `value` delayed by `delayMs`, resetting the clock on every change.
 *
 * Use this for anything that feeds a query key from a text input: without it,
 * each keystroke becomes its own cache entry AND its own HTTP request.
 * SearchOverlay already had this logic inline; it lives here now so search
 * boxes can't accidentally ship undebounced.
 */
import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
