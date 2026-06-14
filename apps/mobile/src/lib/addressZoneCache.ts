/**
 * Local cache for delivery-zone metadata attached to a saved address.
 *
 * The backend `CustomerAddress` model doesn't yet persist cityId / villageId /
 * areaId (that's a follow-up migration), so we mirror the zone selection in
 * AsyncStorage keyed by address id. When the user picks a saved address at
 * checkout, we look the metadata back up here and forward it to the order
 * create call.
 *
 * Worst case (cache miss after app reinstall) the customer just re-picks the
 * zone in CartCheckout — never silently uses a stale or wrong price.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { DeliveryZoneSelection } from '../components/DeliveryZonePicker';

const KEY = '@tamem/address-zones-v1';

type Store = Record<string, DeliveryZoneSelection>;

let cache: Store | null = null;

async function load(): Promise<Store> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    cache = {};
  }
  return cache;
}

async function persist(): Promise<void> {
  if (!cache) return;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* best effort */
  }
}

export async function setAddressZone(
  addressId: string,
  zone: DeliveryZoneSelection,
): Promise<void> {
  const store = await load();
  store[addressId] = zone;
  await persist();
}

export async function getAddressZone(addressId: string): Promise<DeliveryZoneSelection | null> {
  const store = await load();
  return store[addressId] ?? null;
}

export async function removeAddressZone(addressId: string): Promise<void> {
  const store = await load();
  if (store[addressId]) {
    delete store[addressId];
    await persist();
  }
}

/** Synchronous lookup — only safe after the first `getAddressZone()` call. */
export function peekAddressZone(addressId: string): DeliveryZoneSelection | null {
  return cache?.[addressId] ?? null;
}
