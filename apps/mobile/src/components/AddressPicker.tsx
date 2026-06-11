import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { AlertTriangle, Crosshair, Home, MapPin } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from '../lib/api';
import { showToast } from '../lib/toast';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

export interface PickedAddress {
  address: string;
  lat: number;
  lng: number;
  /** True when the user typed it freely. */
  isFreeText?: boolean;
}

interface SavedAddress {
  id: string;
  label: string;
  address: string;
  lat?: number | null;
  lng?: number | null;
  isDefault?: boolean;
}

interface AddressPickerProps {
  value: PickedAddress | null;
  onChange: (a: PickedAddress | null) => void;
}

const LAST_ADDRESS_KEY = '@tamem/last-delivery-address';

/**
 * Order-flow address picker. Three sources, in priority:
 *  1. Saved addresses pulled from /me/addresses (chips).
 *  2. "موقعي الحالي" via expo-location (always shown).
 *  3. Free-text input — saved in AsyncStorage for the next order.
 *
 * Replaces every order screen's silent fallback to قفط center coords.
 */
export function AddressPicker({ value, onChange }: AddressPickerProps) {
  const [freeText, setFreeText] = useState<string>(value?.isFreeText ? value.address : '');
  const [busy, setBusy] = useState(false);

  const { data: saved } = useQuery<SavedAddress[]>({
    queryKey: ['my-addresses'],
    queryFn: () => api.raw.get('/me/addresses').then((r) => r.data.data),
    staleTime: 60_000,
  });

  // On first mount, hydrate from last-used if no value yet.
  useEffect(() => {
    if (value) return;
    void AsyncStorage.getItem(LAST_ADDRESS_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as PickedAddress;
        if (parsed?.address) {
          onChange(parsed);
          if (parsed.isFreeText) setFreeText(parsed.address);
        }
      } catch {
        /* ignore */
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // Best-effort reverse geocoding.
      let label = `موقع GPS (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`;
      try {
        const geo = await Location.reverseGeocodeAsync({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        if (geo[0]) {
          const g = geo[0];
          label = [g.street, g.district, g.city, g.region].filter(Boolean).join(', ') || label;
        }
      } catch {
        /* fall through */
      }
      const picked: PickedAddress = {
        address: label,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };
      onChange(picked);
      void AsyncStorage.setItem(LAST_ADDRESS_KEY, JSON.stringify(picked));
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

  const pickSaved = (a: SavedAddress) => {
    if (typeof a.lat !== 'number' || typeof a.lng !== 'number') {
      showToast({
        title: 'العنوان غير مكتمل',
        message: 'هذا العنوان مفقود الإحداثيات. ادخل عنوان آخر أو حدّث الإحداثيات.',
        tone: 'error',
      });
      return;
    }
    const picked: PickedAddress = { address: a.address, lat: a.lat, lng: a.lng };
    onChange(picked);
    setFreeText('');
    void AsyncStorage.setItem(LAST_ADDRESS_KEY, JSON.stringify(picked));
  };

  const handleFreeText = (text: string) => {
    setFreeText(text);
    if (text.trim().length < 6) {
      onChange(null);
      return;
    }
    // Free-text uses a NULL location — the order screen MUST require a
    // saved-address or current-location before allowing submit. See the
    // disabled-submit logic on each flow.
    onChange({ address: text.trim(), lat: 0, lng: 0, isFreeText: true });
  };

  return (
    <View style={{ gap: spacing.sm }}>
      {/* Saved addresses chips */}
      {saved && saved.length > 0 ? (
        <View style={styles.chipsRow}>
          {saved.map((a) => {
            const active = value?.lat === a.lat && value?.lng === a.lng && !value?.isFreeText;
            return (
              <Pressable
                key={a.id}
                onPress={() => pickSaved(a)}
                style={({ pressed }) => [
                  styles.chip,
                  active && styles.chipActive,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Home size={12} color={active ? colors.white : colors.brand.red} />
                <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                  {a.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <Pressable
        onPress={useCurrentLocation}
        disabled={busy}
        style={({ pressed }) => [styles.currentBtn, (pressed || busy) && { opacity: 0.85 }]}
      >
        <View style={styles.currentIcon}>
          <Crosshair size={16} color={colors.brand.red} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.currentLabel}>
            {busy ? 'جاري قراءة موقعك…' : 'استخدم موقعي الحالي'}
          </Text>
          {value && !value.isFreeText && value.lat !== 0 ? (
            <Text style={styles.currentSub} numberOfLines={1}>
              {value.address}
            </Text>
          ) : (
            <Text style={styles.currentSub}>دقّة GPS أعلى للسائق</Text>
          )}
        </View>
      </Pressable>

      <View style={styles.freeTextField}>
        <MapPin size={14} color={colors.text.muted} />
        <TextInput
          value={freeText}
          onChangeText={handleFreeText}
          placeholder="أو اكتب عنوان آخر (شارع، علامة، طابق…)"
          placeholderTextColor={colors.text.muted}
          style={styles.freeTextInput}
          multiline
        />
      </View>

      {value?.isFreeText ? (
        <View style={styles.warnBanner}>
          <AlertTriangle size={14} color={colors.warning} />
          <Text style={styles.warnText}>
            كتبت العنوان يدوي بدون GPS. الإدارة هتتواصل معاك تأكيد الموقع قبل السائق.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
  },
  chipActive: { backgroundColor: colors.brand.red },
  chipText: {
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xs,
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
  },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.warningLight,
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  warnText: {
    flex: 1,
    color: '#9A6B16',
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
    lineHeight: 18,
  },
});
