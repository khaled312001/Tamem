/**
 * How far a single "create" click takes a new order.
 *
 * Deliberately NOT the full twelve-state FSM. An agent on the phone gives one
 * of four answers — "لسه", "مع المندوب", "في الطريق", "خلص" — and the order
 * page still has the granular walk for everything else. The backend accepts the
 * key as `advanceTo` on POST /admin/orders and records the jump as a jump: one
 * history row from where the order was to where it ended, rather than six
 * invented timestamps claiming it sat in each state.
 *
 * Shared by both order screens so the two cannot drift into offering different
 * stages for the same endpoint.
 */
export type OrderStageKey = 'NEW' | 'ACCEPTED' | 'DRIVER_ASSIGNED' | 'IN_ROUTE' | 'COMPLETED';

export interface OrderStage {
  key: OrderStageKey;
  label: string;
  hint: string;
  /** Meaningless without somebody to hand it to, so the option is disabled. */
  needsDriver: boolean;
}

export const ORDER_STAGES: readonly OrderStage[] = [
  { key: 'NEW', label: 'جديد', hint: 'محتاج مراجعة', needsDriver: false },
  { key: 'ACCEPTED', label: 'مؤكد', hint: 'اتفقنا وجاري التجهيز', needsDriver: false },
  { key: 'DRIVER_ASSIGNED', label: 'مع المندوب', hint: 'اتسند لمندوب', needsDriver: true },
  { key: 'IN_ROUTE', label: 'في الطريق', hint: 'خرج للعميل', needsDriver: true },
  { key: 'COMPLETED', label: 'خلص وتسلّم', hint: 'اتسلّم بالفعل', needsDriver: false },
];

/**
 * Where a staff-created order starts: ACCEPTED, not NEW.
 *
 * NEW means "waiting for an admin to look at it" — a review gate for orders
 * that arrive from the app. An order an admin just typed while the customer was
 * on the phone has already been reviewed, by them, and asking them to reopen it
 * and press «قبول الطلب» is asking them to approve their own work.
 */
export const DEFAULT_ORDER_STAGE: OrderStageKey = 'ACCEPTED';
