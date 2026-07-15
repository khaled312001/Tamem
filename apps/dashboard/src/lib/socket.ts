import { io, type Socket } from 'socket.io-client';

import { getAccessToken } from './auth.js';

const wsUrl = import.meta.env.VITE_WS_URL ?? 'http://localhost:4000';
// Some deploys (shared hosting fronting a PHP shim) don't have a Node
// backend and therefore no WebSocket endpoint. Set VITE_DISABLE_SOCKET=true
// in the production build to skip connecting entirely, otherwise the
// browser console fills with reconnect errors on every route change.
const socketDisabled = String(import.meta.env.VITE_DISABLE_SOCKET ?? '').toLowerCase() === 'true';

let socket: Socket | null = null;

export function connectSocket(): Socket {
  if (socket) return socket; // reuse even when in reconnect state
  socket = io(wsUrl, {
    // Allow polling as a fallback so we degrade to HTTP long-polling when
    // WebSocket is unavailable (shared hosting behind LiteSpeed).
    transports: socketDisabled ? [] : ['websocket', 'polling'],
    auth: { token: getAccessToken() },
    reconnection: !socketDisabled,
    reconnectionAttempts: socketDisabled ? 0 : 5,
    reconnectionDelay: 5000,
    reconnectionDelayMax: 30000,
    autoConnect: !socketDisabled,
  });
  if (socketDisabled) {
    socket.io.opts.autoConnect = false;
  }
  // Silently swallow connect errors so the production console doesn't spam.
  // The status pill (useSocketStatus) still shows "disconnected".
  socket.on('connect_error', () => {
    /* handled by useSocketStatus; keep console quiet */
  });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}
