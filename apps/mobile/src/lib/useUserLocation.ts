/**
 * The customer's coarse GPS position, if they've granted permission.
 *
 * Deliberately non-blocking and failure-tolerant: the home screen renders
 * fine without it, and asking for a fix must never delay first paint. When it
 * resolves, callers can re-query `/merchants` with lat/lng and the backend
 * starts returning `distanceKm` — the same thing NearbyMapScreen already does.
 *
 * Uses `Balanced` accuracy: sorting stores by distance does not need GPS-grade
 * precision, and the low-power fix returns much faster.
 */
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

export interface UserLocation {
  lat: number;
  lng: number;
}

export function useUserLocation(enabled = true): UserLocation | null {
  const [loc, setLoc] = useState<UserLocation | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    void (async () => {
      try {
        // Never prompt here — only use permission the user already granted, so
        // opening the app doesn't throw a system dialog at them. The map screen
        // is where the request is made in context.
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;

        const pos = await Location.getLastKnownPositionAsync();
        if (pos && !cancelled) {
          setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          return;
        }

        const fresh = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) setLoc({ lat: fresh.coords.latitude, lng: fresh.coords.longitude });
      } catch {
        // Location is an enhancement, never a requirement.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return loc;
}
