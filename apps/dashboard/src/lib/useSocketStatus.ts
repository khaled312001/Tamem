import { useEffect, useState } from 'react';

import { connectSocket } from './socket.js';

export type SocketStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

// Match the flag socket.ts reads so the status pill matches the actual
// connection strategy — when sockets are disabled, we never even try, so
// "connecting…" would sit forever.
const socketDisabled = String(import.meta.env.VITE_DISABLE_SOCKET ?? '').toLowerCase() === 'true';

/**
 * Subscribes to the live Socket.IO connection state so the header can show a
 * "online / reconnecting / offline" indicator without each page wiring its own.
 */
export function useSocketStatus(): SocketStatus {
  const [status, setStatus] = useState<SocketStatus>(
    socketDisabled ? 'disconnected' : 'connecting',
  );

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
