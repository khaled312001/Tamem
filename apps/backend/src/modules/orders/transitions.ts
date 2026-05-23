import {
  canRoleTransition,
  ORDER_TRANSITIONS,
  type OrderStatus,
  type UserRole,
} from '@tamem/types';

import { InvalidTransitionError, ForbiddenError } from '../../utils/errors.js';

/**
 * Asserts that an order transition is allowed by both the state machine
 * and the actor's role. Throws an AppError otherwise.
 *
 * This is the canonical guard — every status-changing endpoint MUST call it.
 */
export function assertTransition(from: OrderStatus, to: OrderStatus, role: UserRole): void {
  if (!ORDER_TRANSITIONS[from].includes(to)) {
    throw new InvalidTransitionError(from, to);
  }
  if (!canRoleTransition(from, to, role)) {
    throw new ForbiddenError('غير مسموح لك بتنفيذ هذا الانتقال');
  }
}

export { canRoleTransition, ORDER_TRANSITIONS };
