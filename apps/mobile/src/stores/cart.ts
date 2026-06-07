/**
 * Cart store — items the customer queued up before placing the order.
 *
 * Scoped per merchant: switching to a product from a different merchant
 * empties (with confirmation handled in the UI) the previous merchant's
 * cart. Persisted to AsyncStorage so closing the app doesn't lose state.
 *
 * Why Zustand: the same pattern used by `auth.ts` already in this app —
 * keeps the store cheap, no Provider boilerplate, and `subscribe` is what
 * we need for the floating cart badge on Home.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export interface CartItem {
  productId: string;
  nameAr: string;
  price: number;
  imageUrl: string | null;
  quantity: number;
}

export interface CartState {
  merchantId: string | null;
  merchantNameAr: string | null;
  items: CartItem[];
  subtotal: number;
  count: number;
}

const STORAGE_KEY = '@tamem/cart_v1';

let state: CartState = {
  merchantId: null,
  merchantNameAr: null,
  items: [],
  subtotal: 0,
  count: 0,
};
const listeners = new Set<(s: CartState) => void>();
let hydrated = false;

function recompute(items: CartItem[]): { subtotal: number; count: number } {
  let subtotal = 0;
  let count = 0;
  for (const it of items) {
    subtotal += it.price * it.quantity;
    count += it.quantity;
  }
  return { subtotal: Math.round(subtotal * 100) / 100, count };
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
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CartState;
      if (parsed && Array.isArray(parsed.items)) {
        state = parsed;
        listeners.forEach((fn) => fn(state));
      }
    }
  } catch {
    /* ignore — fresh cart is fine */
  }
}

/** Subscribe to cart changes (returns unsubscribe). */
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
 * Add (or merge) a product. If the product is from a different merchant
 * than the current cart, callers should confirm with the user before
 * calling `replaceMerchant`, because we don't want to silently nuke an
 * in-progress order.
 *
 * Returns:
 *   "ok"            — item added/merged
 *   "wrong_merchant"— caller should prompt + call replaceMerchant
 */
export function addToCart(opts: {
  product: { id: string; nameAr: string; price: number; imageUrl?: string | null };
  merchantId: string;
  merchantNameAr: string;
  quantity?: number;
}): 'ok' | 'wrong_merchant' {
  const qty = Math.max(1, Math.floor(opts.quantity ?? 1));
  if (state.merchantId && state.merchantId !== opts.merchantId && state.items.length > 0) {
    return 'wrong_merchant';
  }
  const idx = state.items.findIndex((i) => i.productId === opts.product.id);
  let items: CartItem[];
  if (idx >= 0) {
    items = state.items.map((it, i) => (i === idx ? { ...it, quantity: it.quantity + qty } : it));
  } else {
    items = [
      ...state.items,
      {
        productId: opts.product.id,
        nameAr: opts.product.nameAr,
        price: opts.product.price,
        imageUrl: opts.product.imageUrl ?? null,
        quantity: qty,
      },
    ];
  }
  setState({
    merchantId: opts.merchantId,
    merchantNameAr: opts.merchantNameAr,
    items,
    ...recompute(items),
  });
  return 'ok';
}

/** Replace the cart with a single new item from a new merchant. */
export function replaceMerchant(opts: {
  product: { id: string; nameAr: string; price: number; imageUrl?: string | null };
  merchantId: string;
  merchantNameAr: string;
  quantity?: number;
}): void {
  const qty = Math.max(1, Math.floor(opts.quantity ?? 1));
  const items: CartItem[] = [
    {
      productId: opts.product.id,
      nameAr: opts.product.nameAr,
      price: opts.product.price,
      imageUrl: opts.product.imageUrl ?? null,
      quantity: qty,
    },
  ];
  setState({
    merchantId: opts.merchantId,
    merchantNameAr: opts.merchantNameAr,
    items,
    ...recompute(items),
  });
}

/** Set absolute quantity (used by +/- controls in the cart). 0 → removed. */
export function setItemQuantity(productId: string, quantity: number): void {
  let items: CartItem[];
  if (quantity <= 0) {
    items = state.items.filter((i) => i.productId !== productId);
  } else {
    items = state.items.map((i) => (i.productId === productId ? { ...i, quantity } : i));
  }
  setState({
    ...state,
    items,
    ...recompute(items),
    merchantId: items.length === 0 ? null : state.merchantId,
    merchantNameAr: items.length === 0 ? null : state.merchantNameAr,
  });
}

export function removeFromCart(productId: string): void {
  setItemQuantity(productId, 0);
}

export function clearCart(): void {
  setState({ merchantId: null, merchantNameAr: null, items: [], subtotal: 0, count: 0 });
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
