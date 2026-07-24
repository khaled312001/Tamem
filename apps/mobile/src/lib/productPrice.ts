/**
 * The one place that decides what a product costs.
 *
 * There are TWO discount knobs on Product and an admin may use either:
 *   - `salePrice`: an absolute replacement price
 *   - `discount`:  a percentage off the list price
 *
 * They are independent (see the schema comment on Product.discount). The
 * product page only ever handled `salePrice`, so a product discounted by
 * percentage showed its FULL price on the detail screen while the home rail
 * showed the reduced one — the customer saw two different numbers for the same
 * item, and the cart would have charged the higher.
 *
 * Every screen that shows or charges a price must go through this.
 */

export interface PricedProduct {
  price: number | string;
  salePrice?: number | string | null;
  discount?: number | string | null;
  /** Optional expiry for the discount (ISO). Past → the discount is ignored. */
  saleEndsAt?: string | null;
}

export interface ProductPrice {
  /** What the customer pays. */
  now: number;
  /** List price, only when it differs — render it struck through. */
  was: number | null;
  /** Whole-percent discount, 0 when there isn't one. */
  off: number;
  hasDiscount: boolean;
}

export function productPrice(p: PricedProduct): ProductPrice {
  const list = Number(p.price ?? 0);
  if (!Number.isFinite(list) || list <= 0) {
    return { now: 0, was: null, off: 0, hasDiscount: false };
  }

  // A timed offer that has ended reverts to the list price — the same rule the
  // server applies when it prices the order, so the two never disagree.
  if (p.saleEndsAt) {
    const ends = Date.parse(p.saleEndsAt);
    if (Number.isFinite(ends) && ends <= Date.now()) {
      return { now: list, was: null, off: 0, hasDiscount: false };
    }
  }

  // salePrice wins when both are set: it's an explicit number the admin typed,
  // so it should beat a percentage rule.
  const sale = p.salePrice != null ? Number(p.salePrice) : null;
  if (sale != null && Number.isFinite(sale) && sale > 0 && sale < list) {
    return {
      now: sale,
      was: list,
      off: Math.round(((list - sale) / list) * 100),
      hasDiscount: true,
    };
  }

  const pct = p.discount != null ? Number(p.discount) : 0;
  if (Number.isFinite(pct) && pct > 0) {
    // Clamped: the schema allows 0..90, but a bad row must never produce a
    // negative price.
    const safe = Math.min(90, pct);
    return {
      now: Math.round(list * (1 - safe / 100) * 100) / 100,
      was: list,
      off: Math.round(safe),
      hasDiscount: true,
    };
  }

  return { now: list, was: null, off: 0, hasDiscount: false };
}

/**
 * The product's LIVE percentage discount (0..90), or 0 if none or expired.
 * Mirrors the server's activeDiscountPct. Only the percentage knob is used —
 * an absolute salePrice can't scale to a chosen size — so this is what a sized
 * product's discount runs through.
 */
export function activeDiscountPct(p: {
  discount?: number | string | null;
  saleEndsAt?: string | null;
}): number {
  if (p.saleEndsAt) {
    const ends = Date.parse(p.saleEndsAt);
    if (Number.isFinite(ends) && ends <= Date.now()) return 0;
  }
  const pct = Number(p.discount ?? 0);
  return Number.isFinite(pct) && pct > 0 ? Math.min(90, pct) : 0;
}

/** Apply a percentage to an amount, rounded to piastres. */
export function applyPct(amount: number, pct: number): number {
  return pct > 0 ? Math.round(amount * (1 - pct / 100) * 100) / 100 : amount;
}
