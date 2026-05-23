import { io, type Socket } from 'socket.io-client';

import { getAccessToken } from './auth.js';

const wsUrl = import.meta.env.VITE_WS_URL ?? 'http://localhost:4000';

let socket: Socket | null = null;

export function connectSocket(): Socket {
  if (socket?.connected) return socket;
  socket = io(wsUrl, {
    transports: ['websocket'],
    auth: { token: getAccessToken() },
    reconnection: true,
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
