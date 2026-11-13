import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { Check, Crosshair, Home, Info, MapPin } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from '../lib/api';
import { getAddressZone } from '../lib/addressZoneCache';
import { showToast } from '../lib/toast';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';
import { DeliveryZonePicker, type DeliveryZoneSelection } from './DeliveryZonePicker';

export interface PickedAddress {
  address: string;
  /** GPS pin — OPTIONAL. A zoned address with no pin is fully deliverable; the
   *  zone is what prices and routes the order. Null when the address has no pin. */
  lat: number | null;
  lng: number | null;
  /** True when there is no GPS pin (typed details only). */
  isFreeText?: boolean;
  /** Delivery zone — only set once city, village AND area are all chosen. */
  zone?: DeliveryZoneSelection | null;
  /** Saved-address id, so the active chip matches by identity not coordinates. */
  savedId?: string;
}

interface SavedAddress {
  id: string;
  label: string;
  address: string;
  lat?: number | null;
  lng?: number | null;
  isDefault?: boolean;
  // Zone comes straight from /me/addresses (server-persisted), so a pin-less
  // but zoned address is usable without any local cache.
  cityId?: string | null;
  villageId?: string | null;
  areaId?: string | null;
  zone?: DeliveryZoneSelection | null;
}

interface AddressPickerProps {
  /** The store being ordered from — forwarded to the zone quote so an order
   *  that crosses cities is priced as one instead of as a local delivery. */
  merchantId?: string | null;
  /** Every store in the basket, for a cart that spans more than one. */
  merchantIds?: string[] | null;
  value: PickedAddress | null;
  onChange: (a: PickedAddress | null) => void;
}

const LAST_ADDRESS_KEY = '@tamem/last-delivery-address';

const zoneComplete = (z?: DeliveryZoneSelection | null): z is DeliveryZoneSelection =>
  !!(z?.cityId && z.villageId && z.areaId);
const zoneLabel = (z: DeliveryZoneSelection) =>
  [z.villageName, z.areaName].filter(Boolean).join(' — ');

/**
 * Where the order goes. Customers kept getting stuck here: typing the address
 * or tapping «موقعي الحالي» threw away the zone they had just picked, the zone
 * section only appeared after typing, and every order started from nothing.
 *
 * Now, top to bottom:
 *  1. Their addresses as chips. The server saves the address of every order
 *     (with its zone), so after the first order this is one tap, and the
 *     address used last is filled in on its own.
 *  2. The zone (city → village → area), always shown. قفط comes preselected
 *     and «قفط المدينة» heads the village list.
 *  3. Details (street, landmark, floor). Optional when the zone is complete:
 *     the zone's name is sent instead.
 *  4. «موقعي الحالي» adds a GPS pin and keeps everything else.
 *
 * Each part is held on its own and changing one never resets another. The
 * parent gets a value only when the order can actually be placed with it:
 * a complete zone or a pin, plus some text.
 */
export function AddressPicker({ value, onChange, merchantId, merchantIds }: AddressPickerProps) {
  const [text, setText] = useState<string>(value?.address ?? '');
  const [zone, setZone] = useState<DeliveryZoneSelection | null>(value?.zone ?? null);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
    value?.lat != null && value?.lng != null ? { lat: value.lat, lng: value.lng } : null,
  );
  const [savedId, setSavedId] = useState<string | undefined>(value?.savedId);
  const [busy, setBusy] = useState(false);
  // Something was already chosen (by the customer, or loaded from before), so
  // the default address must not overwrite it when the list arrives.
  const settled = useRef(!!value);

  const { data: saved } = useQuery<SavedAddress[]>({
    queryKey: ['my-addresses'],
    queryFn: () => api.raw.get('/me/addresses').then((r) => r.data.data),
    staleTime: 60_000,
    // The server adds the address of each order to this list: fetch it fresh
    // every time an order screen opens so the last one is there.
    refetchOnMount: 'always',
  });

  // Push the combined value up whenever a part changes.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const complete = zoneComplete(zone);
    const address = text.trim() || (complete ? zoneLabel(zone) : '');
    const next: PickedAddress | null =
      address.length >= 3 && (complete || pin)
        ? {
            address,
            lat: pin?.lat ?? null,
            lng: pin?.lng ?? null,
            isFreeText: !pin,
            zone: complete ? zone : null,
            savedId,
          }
        : // Not placeable yet. Keep what was typed so the checkout's message
          // is about the missing zone, not a missing address.
          address
          ? { address, lat: null, lng: null, isFreeText: true, zone: null, savedId }
          : null;
    onChange(next);
    if (address || zone?.cityId) {
      void AsyncStorage.setItem(
        LAST_ADDRESS_KEY,
        JSON.stringify({
          address: text.trim(),
          lat: pin?.lat ?? null,
          lng: pin?.lng ?? null,
          zone,
          savedId,
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, zone, pin, savedId]);

  // Start from the last address on this phone; failing that, from the
  // customer's default (= the one their last order went to).
  useEffect(() => {
    if (settled.current) return;
    void AsyncStorage.getItem(LAST_ADDRESS_KEY).then((raw) => {
      if (settled.current || !raw) return;
      try {
        const p = JSON.parse(raw) as PickedAddress;
        if (!p?.address && !p?.zone?.cityId) return;
        settled.current = true;
        setText(p.address ?? '');
        setZone(p.zone ? { ...p.zone, quoteStatus: undefined } : null);
        setPin(p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null);
        setSavedId(p.savedId);
      } catch {
        /* ignore */
      }
    });
  }, []);
  useEffect(() => {
    if (settled.current || !saved?.length) return;
    const def = saved.find((a) => a.isDefault) ?? saved[0];
    if (def) void pickSaved(def, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  const useCurrentLocation = async () => {
    setBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        showToast({
          title: 'لا يوجد إذن للموقع',
          message: 'فعّل صلاحية الموقع من إعدادات الجهاز',
          tone: 'error',
        });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      settled.current = true;
      setPin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setSavedId(undefined);
      // Fill the details from the map only when nothing was typed: what the
      // customer wrote («جنب مسجد النور») beats a street name from the map.
      if (!text.trim()) {
        try {
          const geo = await Location.reverseGeocodeAsync({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
          const g = geo[0];
          const label = g ? [g.street, g.district, g.city].filter(Boolean).join('، ') : '';
          if (label) setText(label);
        } catch {
          /* the pin alone is enough */
        }
      }
    } catch (err) {
      showToast({
        title: 'تعذّر قراءة موقعك',
        message: err instanceof Error ? err.message : undefined,
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  async function pickSaved(a: SavedAddress, auto = false): Promise<void> {
    // Zone from the server record first (survives a reinstall), falling back
    // to the local cache for addresses saved before the server kept zones.
    const z = a.zone ?? (await getAddressZone(a.id));
    if (auto && settled.current) return;
    settled.current = true;
    setText(a.address);
    setZone(z ? { ...z, quoteStatus: undefined } : null);
    setPin(
      typeof a.lat === 'number' && typeof a.lng === 'number' ? { lat: a.lat, lng: a.lng } : null,
    );
    setSavedId(a.id);
  }

  const complete = zoneComplete(zone);
  const needsZone = !complete && !pin;

  return (
    <View style={{ gap: spacing.md }}>
      {/* 1 — their addresses */}
      {saved && saved.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          <Text style={styles.stepLabel}>عناوينك</Text>
          <View style={styles.chipsRow}>
            {saved.map((a) => {
              const active = savedId === a.id;
              return (
                <Pressable
                  key={a.id}
                  onPress={() => {
                    void pickSaved(a);
                  }}
                  style={({ pressed }) => [
                    styles.chip,
                    active && styles.chipActive,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  {active ? (
                    <Check size={12} color={colors.white} />
                  ) : (
                    <Home size={12} color={colors.brand.red} />
                  )}
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}
                    numberOfLines={1}
                  >
                    {a.label || a.address}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* 2 — the zone: prices and routes the order */}
      <View style={styles.zoneSection}>
        <View style={styles.zoneHeader}>
          <MapPin size={14} color={colors.brand.red} />
          <Text style={styles.zoneTitle}>منطقة التوصيل</Text>
        </View>
        <DeliveryZonePicker
          merchantId={merchantId}
          merchantIds={merchantIds}
          value={zone}
          onChange={(z) => {
            // قفط preselected on its own is not a choice: the default address
            // may still arrive and replace it.
            if (z?.villageId) settled.current = true;
            // A different area is a different address; the same one coming
            // back with its price is not.
            if (
              (z?.areaId || '') !== (zone?.areaId || '') ||
              (z?.villageId || '') !== (zone?.villageId || '')
            ) {
              setSavedId(undefined);
            }
            setZone(z);
          }}
        />
      </View>

      {/* 3 — details */}
      <View style={{ gap: spacing.xs }}>
        <Text style={styles.stepLabel}>العنوان بالتفصيل</Text>
        <View style={styles.freeTextField}>
          <Home size={14} color={colors.text.muted} />
          <TextInput
            value={text}
            onChangeText={(t) => {
              settled.current = true;
              setText(t);
              setSavedId(undefined);
            }}
            placeholder="الشارع، علامة مميزة، الدور… (اختياري)"
            placeholderTextColor={colors.text.muted}
            style={styles.freeTextInput}
            multiline
          />
        </View>
      </View>

      {/* 4 — GPS pin, optional */}
      <Pressable
        onPress={useCurrentLocation}
        disabled={busy}
        style={({ pressed }) => [styles.currentBtn, (pressed || busy) && { opacity: 0.85 }]}
      >
        <View style={styles.currentIcon}>
          {pin ? (
            <Check size={16} color={colors.success} />
          ) : (
            <Crosshair size={16} color={colors.brand.red} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.currentLabel}>
            {busy ? 'جاري قراءة موقعك…' : pin ? 'موقعك اتحدد على الخريطة' : 'حدّد موقعي الحالي'}
          </Text>
          <Text style={styles.currentSub}>
            {pin ? 'اضغط تاني لو اتحركت' : 'اختياري، بيساعد المندوب يوصلك أسرع'}
          </Text>
        </View>
      </Pressable>

      {needsZone ? (
        <View style={styles.infoBanner}>
          <Info size={14} color={colors.brand.red} />
          <Text style={styles.infoText}>
            اختار القرية والمنطقة عشان نحسب التوصيل، أو حدّد موقعك الحالي.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stepLabel: {
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
    fontSize: fontSizes.sm,
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.white,
    borderColor: colors.brand.red,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.pill,
    maxWidth: '100%',
  },
  chipActive: { backgroundColor: colors.brand.red },
  chipText: {
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xs,
    flexShrink: 1,
  },
  chipTextActive: { color: colors.white },
  currentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand.redLight,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.brand.red + '40',
  },
  currentIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentLabel: {
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
  },
  currentSub: {
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  freeTextField: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.line2,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  freeTextInput: {
    flex: 1,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.ink,
    minHeight: 40,
    paddingVertical: 4,
    textAlignVertical: 'top',
    textAlign: 'right',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.brand.redLight,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  infoText: {
    flex: 1,
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
    lineHeight: 18,
  },
  zoneSection: { gap: spacing.sm },
  zoneHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  zoneTitle: {
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
    fontSize: fontSizes.sm,
  },
});
