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
