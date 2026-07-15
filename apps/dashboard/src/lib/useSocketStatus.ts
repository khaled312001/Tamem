import { useEffect, useState } from 'react';

import { connectSocket } from './socket.js';

export type SocketStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

// Match the flag socket.ts reads so the status pill matches the actual
// connection strategy — when sockets are disabled, we never even try, so
// "connecting…" would sit forever.
const socketDisabled = String(import.meta.env.VITE_DISABLE_SOCKET ?? '').toLowerCase() === 'true';
const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * Subscribes to the live Socket.IO connection state so the header can show a
 * "online / reconnecting / offline" indicator without each page wiring its own.
 *
 * When the realtime socket is intentionally disabled (PHP-shim deployment),
 * there is no WebSocket to report on — but the admin still wants to know the
 * server is reachable. So we poll the /health endpoint and surface that as the
 * indicator: green "connected" when the API answers, red only if it's truly
 * down. This avoids the misleading permanent-red "غير متصل" that made the whole
 * dashboard look offline when in fact everything works via auto-refresh.
 */
export function useSocketStatus(): SocketStatus {
  const [status, setStatus] = useState<SocketStatus>(socketDisabled ? 'connecting' : 'connecting');

  // Health-poll mode when the socket is disabled.
  useEffect(() => {
    if (!socketDisabled) return;
    let alive = true;
    const ping = async () => {
      try {
        const res = await fetch(`${apiBase}/health`, { method: 'GET' });
        if (alive) setStatus(res.ok ? 'connected' : 'disconnected');
      } catch {
        if (alive) setStatus('disconnected');
      }
    };
    ping();
    const id = window.setInterval(ping, 30_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (socketDisabled) return;

    const s = connectSocket();

    if (s.connected) setStatus('connected');

    const onConnect = () => setStatus('connected');
    const onDisconnect = () => setStatus('disconnected');
    const onReconnectAttempt = () => setStatus('reconnecting');
    const onConnectError = () => setStatus('disconnected');

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.io.on('reconnect_attempt', onReconnectAttempt);
    s.io.on('error', onConnectError);

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.io.off('reconnect_attempt', onReconnectAttempt);
      s.io.off('error', onConnectError);
    };
  }, []);

  return status;
}
