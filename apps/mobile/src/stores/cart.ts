/**
 * Cart store — items the customer queued up before placing the order.
 *
 * Multi-merchant: each line item carries its own merchantId/name so the
 * customer can mix products from several stores in one cart. The checkout
 * groups items by merchant for display, but the backend creates ONE order for
 * the whole cart — so it's priced and assigned a driver once.
 *
 * Line identity is `lineId`, NOT productId: the same pizza in two sizes, or
 * with and without extra cheese, are separate lines that must not merge. For a
 * product with no options `lineId === productId`, which is what keeps the
 * quick +/- buttons on the store page (they only know a product id) working.
 *
 * Persisted to AsyncStorage so closing the app doesn't lose state.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export interface CartAddon {
  id: string;
  nameAr: string;
  price: number;
}

export interface CartItem {
  /** Stable identity of this line — see the file header. */
  lineId: string;
  productId: string;
  nameAr: string;
  /** Unit price WITH the chosen size and extras already applied. */
  price: number;
  imageUrl: string | null;
  quantity: number;
  merchantId: string;
  merchantNameAr: string;
  /** Chosen size, when the product has any. */
  variantId?: string | null;
  variantNameAr?: string | null;
  addons?: CartAddon[];
}

/**
 * Same product + same size + same extras = same line. Add-on ids are sorted so
 * picking cheese-then-olives and olives-then-cheese land on one line.
 */
export function cartLineId(
  productId: string,
  variantId?: string | null,
  addonIds?: string[],
): string {
  const extras = (addonIds ?? []).slice().sort().join(',');
  if (!variantId && !extras) return productId;
  return `${productId}|${variantId ?? ''}|${extras}`;
}

export interface CartState {
  items: CartItem[];
  subtotal: number;
  count: number;
  /** Distinct merchant IDs currently in the cart, in insertion order. */
  merchantIds: string[];
}

/** A merchant group with its own line items + subtotal, used by Cart UI. */
export interface MerchantGroup {
  merchantId: string;
  merchantNameAr: string;
  items: CartItem[];
  subtotal: number;
  count: number;
}

const STORAGE_KEY = '@tamem/cart_v2';
// Old single-merchant key; we discard it on first load to avoid mixing
// shapes. Worst case the user re-adds their items.
const LEGACY_KEY = '@tamem/cart_v1';

let state: CartState = { items: [], subtotal: 0, count: 0, merchantIds: [] };
const listeners = new Set<(s: CartState) => void>();
let hydrated = false;

function recompute(items: CartItem[]): Pick<CartState, 'subtotal' | 'count' | 'merchantIds'> {
  let subtotal = 0;
  let count = 0;
  const seen: string[] = [];
  for (const it of items) {
    subtotal += it.price * it.quantity;
    count += it.quantity;
    if (!seen.includes(it.merchantId)) seen.push(it.merchantId);
  }
  return { subtotal: Math.round(subtotal * 100) / 100, count, merchantIds: seen };
}

function setState(next: CartState): void {
  state = next;
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
  listeners.forEach((fn) => fn(next));
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    // Wipe the legacy v1 cart if present — schema is incompatible.
    await AsyncStorage.removeItem(LEGACY_KEY).catch(() => undefined);
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CartState;
      if (parsed && Array.isArray(parsed.items)) {
        // Defensive: ensure every item has a merchantId. Drop malformed rows.
        const items = parsed.items
          .filter((i) => i && typeof i.merchantId === 'string' && typeof i.productId === 'string')
          // Carts saved before sizes/add-ons existed have no lineId. They can
          // only be plain products, so productId is the correct lineId.
          .map((i) => (i.lineId ? i : { ...i, lineId: i.productId }));
        state = { items, ...recompute(items) };
        listeners.forEach((fn) => fn(state));
      }
    }
  } catch {
    /* ignore — fresh cart is fine */
  }
}

export function subscribeCart(fn: (s: CartState) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getCart(): CartState {
  return state;
}

/**
 * Add (or merge) a product from any merchant. Multi-merchant carts are
 * allowed — the checkout splits the order per merchant automatically.
 */
export function addToCart(opts: {
  product: { id: string; nameAr: string; price: number; imageUrl?: string | null };
  merchantId: string;
  merchantNameAr: string;
  quantity?: number;
  /** Chosen size. Its price REPLACES the base price (server does the same). */
  variant?: { id: string; nameAr: string; price: number } | null;
  addons?: CartAddon[];
}): void {
  const qty = Math.max(1, Math.floor(opts.quantity ?? 1));
  const addons = opts.addons ?? [];
  const lineId = cartLineId(
    opts.product.id,
    opts.variant?.id,
    addons.map((a) => a.id),
  );
  // Display price only — the server re-derives every price from the DB.
  const base = opts.variant ? opts.variant.price : opts.product.price;
  const unit =
    Math.round((base + addons.reduce((sum, a) => sum + (Number(a.price) || 0), 0)) * 100) / 100;

  const idx = state.items.findIndex((i) => i.lineId === lineId && i.merchantId === opts.merchantId);
  let items: CartItem[];
  if (idx >= 0) {
    items = state.items.map((it, i) => (i === idx ? { ...it, quantity: it.quantity + qty } : it));
  } else {
    items = [
      ...state.items,
      {
        lineId,
        productId: opts.product.id,
        nameAr: opts.product.nameAr,
        price: unit,
        imageUrl: opts.product.imageUrl ?? null,
        quantity: qty,
        merchantId: opts.merchantId,
        merchantNameAr: opts.merchantNameAr,
        variantId: opts.variant?.id ?? null,
        variantNameAr: opts.variant?.nameAr ?? null,
        addons,
      },
    ];
  }
  setState({ items, ...recompute(items) });
}

/**
 * Set absolute quantity (used by +/- controls in the cart). 0 → removed.
 *
 * Accepts a lineId OR a bare productId. The store page's +/- only knows the
 * product, so a productId there hits every option-line of that product — which
 * is the sane reading of "minus one" from a screen that shows one row.
 */
export function setItemQuantity(id: string, quantity: number, merchantId?: string): void {
  let items: CartItem[];
  const matches = (i: CartItem): boolean =>
    (i.lineId === id || i.productId === id) && (!merchantId || i.merchantId === merchantId);
  if (quantity <= 0) {
    items = state.items.filter((i) => !matches(i));
  } else {
    items = state.items.map((i) => (matches(i) ? { ...i, quantity } : i));
  }
  setState({ items, ...recompute(items) });
}

export function removeFromCart(id: string, merchantId?: string): void {
  setItemQuantity(id, 0, merchantId);
}

/** Remove all items belonging to one merchant (used by section "clear"). */
export function clearMerchant(merchantId: string): void {
  const items = state.items.filter((i) => i.merchantId !== merchantId);
  setState({ items, ...recompute(items) });
}

export function clearCart(): void {
  setState({ items: [], subtotal: 0, count: 0, merchantIds: [] });
}

/** Return the cart grouped by merchant — order preserved by insertion. */
export function getMerchantGroups(s: CartState = state): MerchantGroup[] {
  const map = new Map<string, MerchantGroup>();
  for (const it of s.items) {
    let group = map.get(it.merchantId);
    if (!group) {
      group = {
        merchantId: it.merchantId,
        merchantNameAr: it.merchantNameAr,
        items: [],
        subtotal: 0,
        count: 0,
      };
      map.set(it.merchantId, group);
    }
    group.items.push(it);
    group.subtotal += it.price * it.quantity;
    group.count += it.quantity;
  }
  // Round each group's subtotal to fix float drift.
  for (const g of map.values()) g.subtotal = Math.round(g.subtotal * 100) / 100;
  return Array.from(map.values());
}

/** React hook that re-renders when the cart changes. */
export function useCart(): CartState {
  const [snapshot, setSnapshot] = useState<CartState>(state);
  useEffect(() => {
    void hydrate();
    return subscribeCart(setSnapshot);
  }, []);
  return snapshot;
}
