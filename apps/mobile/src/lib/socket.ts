import { io, type Socket } from 'socket.io-client';

import { getAccessTokenAsync } from '../stores/auth';

import { playInAppNotification } from './notificationSound';

const wsUrl = process.env.EXPO_PUBLIC_WS_URL ?? 'http://localhost:4000';

let socket: Socket | null = null;
let soundHandlersAttached = false;

/**
 * Lazily connects (or returns the existing connection) using the cached access token.
 * The backend's bootstrapWs() verifies the JWT during handshake and:
 *   - auto-joins user:<id> for everyone
 *   - auto-joins admin:* rooms when role=ADMIN (not relevant on mobile)
 * For order-level updates the screen must explicitly emit order:subscribe.
 */
export async function connectSocket(): Promise<Socket> {
  if (socket?.connected) return socket;
  const token = await getAccessTokenAsync();
  if (socket) socket.disconnect();
  socket = io(wsUrl, {
    transports: ['websocket'],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1500,
  });
  attachGlobalSoundHandlers(socket);
  return socket;
}

/**
 * Attaches one-time global listeners that play the in-app notification sound
 * whenever a server-pushed event lands. Individual screens still bind their
 * own listeners for state updates; this layer just owns audible feedback.
 *
 * We never want to fire the sound for the chatty `driver:location` stream
 * (one push every ~10s would be obnoxious).
 */
function attachGlobalSoundHandlers(s: Socket): void {
  if (soundHandlersAttached) return;
  soundHandlersAttached = true;
  const play = () => {
    void playInAppNotification();
  };
  s.on('order:new', play);
  s.on('order:status', play);
  s.on('alert:new', play);
  s.on('notification:new', play);
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
  soundHandlersAttached = false;
}

export function getSocket(): Socket | null {
  return socket;
}

/** Convenience helpers — matches dashboard's API for symmetry. */
export async function subscribeToOrder(orderId: string): Promise<void> {
  const s = await connectSocket();
  s.emit('order:subscribe', orderId);
}

export async function unsubscribeFromOrder(orderId: string): Promise<void> {
  const s = await connectSocket();
  s.emit('order:unsubscribe', orderId);
}
