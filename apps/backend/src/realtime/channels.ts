import type { Server as SocketServer } from 'socket.io';

/**
 * Centralized helpers for emitting realtime events.
 * Controllers import these instead of touching socket.io directly.
 */

export function emitNewOrder(io: SocketServer | undefined, order: { id: string }) {
  if (!io) return;
  io.to('admin:orders').emit('order:new', order);
}

export function emitOrderStatusChange(
  io: SocketServer | undefined,
  order: { id: string; customerId?: string; assignedDriverId?: string | null },
) {
  if (!io) return;
  io.to(`order:${order.id}`).emit('order:status', order);
  io.to('admin:orders').emit('order:status', order);
  if (order.customerId) {
    io.to(`user:${order.customerId}`).emit('order:status', order);
  }
  if (order.assignedDriverId) {
    io.to(`user:${order.assignedDriverId}`).emit('order:status', order);
  }
}

export function emitNewAlert(io: SocketServer | undefined, alert: { id: string }) {
  if (!io) return;
  io.to('admin:alerts').emit('alert:new', alert);
}
