/**
 * Subscribe to socket events for the lifetime of a component.
 *
 * Why this exists: `connectSocket()` is async, so the natural way to write the
 * subscription is inside an async IIFE — and then the `return () => s.off(...)`
 * belongs to the IIFE, not to `useEffect`. React never calls it, so every mount
 * permanently adds another handler to the singleton socket. Four screens hit
 * this; three of them were leaking. Centralising it means the cleanup can only
 * be written once, correctly.
 *
 * The handler is kept in a ref, so passing an inline arrow does NOT resubscribe
 * on every render — callers don't have to remember useCallback.
 */
import { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';

import { connectSocket } from './socket';

type Handler = (payload?: unknown) => void;

export function useSocketEvents(events: string[], handler: Handler): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  // Join on identity, not reference: a caller passing an inline array literal
  // would otherwise resubscribe on every render.
  const key = events.join('|');

  useEffect(() => {
    let cancelled = false;
    let socket: Socket | null = null;
    const names = key ? key.split('|') : [];
    // Stable indirection so `off` always receives the exact function `on` got.
    const fire: Handler = (payload) => {
      if (!cancelled) handlerRef.current(payload);
    };

    void (async () => {
      const s = await connectSocket();
      // The component may have unmounted while the connection was pending —
      // attaching now would leak, since cleanup has already run.
      if (cancelled) return;
      socket = s;
      names.forEach((n) => s.on(n, fire));
    })();

    return () => {
      cancelled = true;
      if (socket) names.forEach((n) => socket!.off(n, fire));
    };
  }, [key]);
}
