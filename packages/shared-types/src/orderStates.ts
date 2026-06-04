import { UserRole } from './roles.js';

/**
 * The 12 order states defined in the project brief.
 * Source of truth — both backend (Prisma enum) and frontend mirror this.
 */
export const OrderStatus = {
  NEW: 'NEW',
  UNDER_REVIEW: 'UNDER_REVIEW',
  PRICED: 'PRICED',
  AWAITING_CUSTOMER_APPROVAL: 'AWAITING_CUSTOMER_APPROVAL',
  ACCEPTED: 'ACCEPTED',
  DRIVER_ASSIGNED: 'DRIVER_ASSIGNED',
  PICKED_UP: 'PICKED_UP',
  IN_ROUTE: 'IN_ROUTE',
  DELIVERED: 'DELIVERED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

/**
 * Terminal states — no further transitions allowed.
 */
export const TERMINAL_STATUSES: ReadonlyArray<OrderStatus> = [
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
  OrderStatus.REJECTED,
];

/**
 * Allowed transitions: from -> [to...]
 * Any transition not listed here is invalid and the state machine will reject it.
 */
/**
 * NOTE: `AWAITING_CUSTOMER_APPROVAL` is intentionally orphaned in the
 * transition graph — the customer-approval step was removed from the
 * happy path. The status itself is kept in the enum so any historic
 * orders that already reached it keep displaying, but no new order can
 * enter it and no transition out is offered.
 *
 * The flow is now: PRICED → ACCEPTED directly (admin confirms the price
 * was communicated to the customer through the call/WhatsApp channel
 * and the admin proceeds).
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, ReadonlyArray<OrderStatus>>> = {
  NEW: ['UNDER_REVIEW', 'CANCELLED', 'REJECTED'],
  UNDER_REVIEW: ['PRICED', 'REJECTED', 'CANCELLED'],
  PRICED: ['ACCEPTED', 'CANCELLED'],
  // Legacy orders may already be in this state — keep a way out for them.
  AWAITING_CUSTOMER_APPROVAL: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['DRIVER_ASSIGNED', 'CANCELLED'],
  DRIVER_ASSIGNED: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['IN_ROUTE', 'CANCELLED'],
  IN_ROUTE: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [],
};

/**
 * Which role can trigger which transition.
 * Admin can do anything by default; this map covers non-admin permissions.
 */
export const TRANSITION_ROLES: Readonly<
  Record<OrderStatus, Partial<Record<OrderStatus, ReadonlyArray<UserRole>>>>
> = {
  NEW: {
    UNDER_REVIEW: ['ADMIN'],
    CANCELLED: ['CUSTOMER', 'ADMIN'],
    REJECTED: ['ADMIN'],
  },
  UNDER_REVIEW: {
    PRICED: ['ADMIN'],
    REJECTED: ['ADMIN'],
    CANCELLED: ['CUSTOMER', 'ADMIN'],
  },
  PRICED: {
    // Admin confirms the customer agreed (via call/WhatsApp) and moves
    // the order straight to ACCEPTED. No more in-app customer approval.
    ACCEPTED: ['ADMIN'],
    CANCELLED: ['ADMIN'],
  },
  // Kept for legacy orders that are mid-flow on this state — admin can
  // still rescue them, but no new order can enter here.
  AWAITING_CUSTOMER_APPROVAL: {
    ACCEPTED: ['ADMIN'],
    CANCELLED: ['ADMIN'],
  },
  ACCEPTED: {
    DRIVER_ASSIGNED: ['ADMIN'],
    CANCELLED: ['ADMIN'],
  },
  DRIVER_ASSIGNED: {
    PICKED_UP: ['DRIVER', 'ADMIN'],
    CANCELLED: ['ADMIN'],
  },
  PICKED_UP: {
    IN_ROUTE: ['DRIVER', 'ADMIN'],
    CANCELLED: ['ADMIN'],
  },
  IN_ROUTE: {
    DELIVERED: ['DRIVER', 'ADMIN'],
    CANCELLED: ['ADMIN'],
  },
  DELIVERED: {
    COMPLETED: ['ADMIN'],
  },
  COMPLETED: {},
  CANCELLED: {},
  REJECTED: {},
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function canRoleTransition(from: OrderStatus, to: OrderStatus, role: UserRole): boolean {
  if (!canTransition(from, to)) return false;
  if (role === UserRole.ADMIN) return true;
  const allowed = TRANSITION_ROLES[from]?.[to];
  return allowed ? allowed.includes(role) : false;
}

export const ORDER_STATUS_AR: Readonly<Record<OrderStatus, string>> = {
  NEW: 'طلب جديد',
  UNDER_REVIEW: 'قيد المراجعة',
  PRICED: 'تم التسعير',
  AWAITING_CUSTOMER_APPROVAL: 'بانتظار موافقة العميل',
  ACCEPTED: 'مقبول',
  DRIVER_ASSIGNED: 'تم تعيين سائق',
  PICKED_UP: 'تم الاستلام',
  IN_ROUTE: 'في الطريق',
  DELIVERED: 'تم التسليم',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي',
  REJECTED: 'مرفوض',
};
