import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, MapPin, Truck } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '../lib/api';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';
import { BottomSheet } from './ui/BottomSheet';
import { MoneyText } from './ui/MoneyText';

/**
 * Selected delivery-zone tuple — what callers persist into the address /
 * order payload. `deliveryFee` is ADVISORY ONLY (the backend recomputes via
 * /zones/quote-delivery on order create), but we surface it in the UI so the
 * customer can see roughly what to expect before tapping "تأكيد".
 */
export interface DeliveryZoneSelection {
  cityId: string;
  cityName: string;
  villageId: string;
  villageName: string;
  areaId: string;
  areaName: string;
  /** Price returned by /zones/quote-delivery (decimal as number) — null if not yet quoted. */
  deliveryFee: number | null;
  /** Which tier the price came from ('AREA' or 'VILLAGE') — surfaced for debugging only. */
  priceSource?: 'AREA' | 'VILLAGE';
}

interface ZoneOption {
  id: string;
  nameAr: string;
  nameEn?: string | null;
  baseDeliveryPrice?: string | number | null;
  deliveryPrice?: string | number | null;
}

interface QuoteResponse {
  price: string | number;
  cityName: string;
  villageName: string;
  areaName: string;
  source: 'AREA' | 'VILLAGE';
}

interface DeliveryZonePickerProps {
  value: DeliveryZoneSelection | null;
  onChange: (selection: DeliveryZoneSelection | null) => void;
  /** Override the heading shown above the three selects. */
  heading?: string;
  /** Hide the price banner — e.g. when caller already shows it in the totals card. */
  hidePriceBanner?: boolean;
}

/**
 * Three sequential dropdowns (city → village → area) backed by the public
 * /zones/* endpoints. Auto-fetches villages when a city is picked and areas
 * when a village is picked. Once all three are set, POSTs to
 * /zones/quote-delivery and caches the price in component state so the
 * caller can show it next to the order total.
 *
 * The selects are rendered as Pressable rows that open a BottomSheet — this
 * matches our existing AddressPicker / SchedulePicker UX and works on both
 * native (no Picker dependency) and web (no native <select>).
 */
export function DeliveryZonePicker({
  value,
  onChange,
  heading,
  hidePriceBanner,
}: DeliveryZonePickerProps) {
  // ─── Cities ────────────────────────────────────────────────────────────
  const citiesQuery = useQuery<ZoneOption[]>({
    queryKey: ['zones', 'cities'],
    queryFn: () => api.raw.get('/zones/cities').then((r) => r.data.data),
    staleTime: 5 * 60_000,
  });

  // ─── Villages (depends on city) ────────────────────────────────────────
  const villagesQuery = useQuery<ZoneOption[]>({
    queryKey: ['zones', 'villages', value?.cityId ?? null],
    enabled: !!value?.cityId,
    queryFn: () => api.raw.get(`/zones/cities/${value!.cityId}/villages`).then((r) => r.data.data),
    staleTime: 5 * 60_000,
  });

  // ─── Areas (depends on village) ────────────────────────────────────────
  const areasQuery = useQuery<ZoneOption[]>({
    queryKey: ['zones', 'areas', value?.villageId ?? null],
    enabled: !!value?.villageId,
    queryFn: () =>
      api.raw.get(`/zones/villages/${value!.villageId}/areas`).then((r) => r.data.data),
    staleTime: 5 * 60_000,
  });

  // ─── Auto-select قفط if it's the only city ─────────────────────────────
  const autoSelectedCity = useRef(false);
  useEffect(() => {
    if (autoSelectedCity.current) return;
    if (value?.cityId) {
      autoSelectedCity.current = true;
      return;
    }
    const cities = citiesQuery.data;
    if (cities && cities.length === 1) {
      const only = cities[0];
      if (!only) return;
      autoSelectedCity.current = true;
      onChange({
        cityId: only.id,
        cityName: only.nameAr,
        villageId: '',
        villageName: '',
        areaId: '',
        areaName: '',
        deliveryFee: null,
      });
    }
  }, [citiesQuery.data, value?.cityId, onChange]);

  // ─── Quote delivery once all three picked ──────────────────────────────
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const quoteMut = useMutation({
    mutationFn: (ids: { cityId: string; villageId: string; areaId: string }) =>
      api.raw.post('/zones/quote-delivery', ids).then((r) => r.data.data as QuoteResponse),
    onSuccess: (q) => {
      setQuoteError(null);
      if (!value) return;
      const price = typeof q.price === 'string' ? Number(q.price) : q.price;
      // Avoid an infinite render loop — only push back if anything actually
      // changed.
      if (value.deliveryFee !== price || value.priceSource !== q.source) {
        onChange({
          ...value,
          deliveryFee: Number.isFinite(price) ? price : null,
          priceSource: q.source,
        });
      }
    },
    onError: (err: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = err as any;
      const msg: string =
        e?.messageAr ?? e?.message ?? 'هذه المنطقة غير مغطاة حالياً. تواصل مع الإدارة';
      setQuoteError(msg);
      if (value && value.deliveryFee !== null) onChange({ ...value, deliveryFee: null });
    },
  });

  const quoteKey = useMemo(() => {
    if (!value?.cityId || !value?.villageId || !value?.areaId) return null;
    return `${value.cityId}|${value.villageId}|${value.areaId}`;
  }, [value?.cityId, value?.villageId, value?.areaId]);

  const lastQuoted = useRef<string | null>(null);
  useEffect(() => {
    if (!quoteKey) {
      lastQuoted.current = null;
      setQuoteError(null);
      return;
    }
    if (lastQuoted.current === quoteKey) return;
    lastQuoted.current = quoteKey;
    quoteMut.mutate({
      cityId: value!.cityId,
      villageId: value!.villageId,
      areaId: value!.areaId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey]);

  // ─── Sheet state ───────────────────────────────────────────────────────
  const [openSheet, setOpenSheet] = useState<'city' | 'village' | 'area' | null>(null);

  const pickCity = (opt: ZoneOption): void => {
    onChange({
      cityId: opt.id,
      cityName: opt.nameAr,
      villageId: '',
      villageName: '',
      areaId: '',
      areaName: '',
      deliveryFee: null,
    });
    setOpenSheet(null);
  };

  const pickVillage = (opt: ZoneOption): void => {
    if (!value) return;
    onChange({
      ...value,
      villageId: opt.id,
      villageName: opt.nameAr,
      areaId: '',
      areaName: '',
      deliveryFee: null,
    });
    setOpenSheet(null);
  };

  const pickArea = (opt: ZoneOption): void => {
    if (!value) return;
    onChange({
      ...value,
      areaId: opt.id,
      areaName: opt.nameAr,
      deliveryFee: null, // cleared until /quote-delivery resolves
    });
    setOpenSheet(null);
  };

  const cityLabel = value?.cityName || 'اختر المدينة';
  const villageLabel = value?.villageName || 'اختر القرية';
  const areaLabel = value?.areaName || 'اختر المنطقة / النجع';

  const villageDisabled = !value?.cityId;
  const areaDisabled = !value?.villageId;
  const ready = !!value?.cityId && !!value?.villageId && !!value?.areaId;

  return (
    <View style={styles.wrap}>
      {heading ? <Text style={styles.heading}>{heading}</Text> : null}

      <SelectRow
        label="المدينة"
        value={cityLabel}
        placeholder
        active={openSheet === 'city'}
        loading={citiesQuery.isLoading}
        onPress={() => setOpenSheet('city')}
        hasValue={!!value?.cityId}
      />

      <SelectRow
        label="القرية"
        value={villageLabel}
        placeholder
        active={openSheet === 'village'}
        loading={!!value?.cityId && villagesQuery.isLoading}
        onPress={() => !villageDisabled && setOpenSheet('village')}
        disabled={villageDisabled}
        hasValue={!!value?.villageId}
      />

      <SelectRow
        label="المنطقة / النجع"
        value={areaLabel}
        placeholder
        active={openSheet === 'area'}
        loading={!!value?.villageId && areasQuery.isLoading}
        onPress={() => !areaDisabled && setOpenSheet('area')}
        disabled={areaDisabled}
        hasValue={!!value?.areaId}
      />

      {/* Price banner / no-coverage error */}
      {!hidePriceBanner && ready ? (
        quoteMut.isPending ? (
          <View style={styles.priceBanner}>
            <ActivityIndicator size="small" color={colors.brand.red} />
            <Text style={styles.priceLabel}>جاري حساب رسوم التوصيل…</Text>
          </View>
        ) : quoteError ? (
          <View style={styles.errorBanner}>
            <AlertTriangle size={16} color={colors.danger} />
            <Text style={styles.errorText} numberOfLines={3}>
              {quoteError}
            </Text>
          </View>
        ) : value?.deliveryFee != null ? (
          <View style={styles.priceBanner}>
            <Truck size={16} color={colors.brand.red} />
            <Text style={styles.priceLabel}>سعر التوصيل:</Text>
            <View style={{ flex: 1 }} />
            <MoneyText amount={value.deliveryFee} size="md" tone="brand" />
          </View>
        ) : null
      ) : null}

      {/* City sheet */}
      <BottomSheet
        visible={openSheet === 'city'}
        onClose={() => setOpenSheet(null)}
        title="اختر المدينة"
      >
        <OptionList
          options={citiesQuery.data ?? []}
          selectedId={value?.cityId}
          onPick={pickCity}
          loading={citiesQuery.isLoading}
          emptyText="لا توجد مدن متاحة حالياً"
        />
      </BottomSheet>

      {/* Village sheet */}
      <BottomSheet
        visible={openSheet === 'village'}
        onClose={() => setOpenSheet(null)}
        title="اختر القرية"
        subtitle={value?.cityName}
      >
        <OptionList
          options={villagesQuery.data ?? []}
          selectedId={value?.villageId}
          onPick={pickVillage}
          loading={villagesQuery.isLoading}
          emptyText="لا توجد قرى لهذه المدينة"
        />
      </BottomSheet>

      {/* Area sheet */}
      <BottomSheet
        visible={openSheet === 'area'}
        onClose={() => setOpenSheet(null)}
        title="اختر المنطقة / النجع"
        subtitle={value?.villageName}
      >
        <OptionList
          options={areasQuery.data ?? []}
          selectedId={value?.areaId}
          onPick={pickArea}
          loading={areasQuery.isLoading}
          emptyText="لا توجد مناطق لهذه القرية"
          showPrice
        />
      </BottomSheet>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Sub-components
// ════════════════════════════════════════════════════════════════════════

function SelectRow({
  label,
  value,
  active,
  loading,
  onPress,
  disabled,
  hasValue,
}: {
  label: string;
  value: string;
  placeholder?: boolean;
  active?: boolean;
  loading?: boolean;
  onPress: () => void;
  disabled?: boolean;
  hasValue?: boolean;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.selectField,
          active && styles.selectFieldActive,
          disabled && styles.selectFieldDisabled,
          pressed && !disabled && { opacity: 0.85 },
        ]}
      >
        <MapPin
          size={16}
          color={disabled ? colors.text.muted : hasValue ? colors.brand.red : colors.text.muted}
        />
        <Text
          style={[
            styles.selectValue,
            !hasValue && { color: colors.text.muted },
            disabled && { color: colors.text.disabled },
          ]}
          numberOfLines={1}
        >
          {value}
        </Text>
        {loading ? (
          <ActivityIndicator size="small" color={colors.brand.red} />
        ) : (
          <ChevronDown size={18} color={disabled ? colors.text.disabled : colors.text.muted} />
        )}
      </Pressable>
    </View>
  );
}

function OptionList({
  options,
  selectedId,
  onPick,
  loading,
  emptyText,
  showPrice,
}: {
  options: ZoneOption[];
  selectedId?: string;
  onPick: (opt: ZoneOption) => void;
  loading?: boolean;
  emptyText: string;
  showPrice?: boolean;
}) {
  if (loading) {
    return (
      <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
        <ActivityIndicator color={colors.brand.red} />
      </View>
    );
  }
  if (options.length === 0) {
    return (
      <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
        <Text style={styles.emptyText}>{emptyText}</Text>
      </View>
    );
  }
  return (
    <View style={{ paddingBottom: spacing.md }}>
      {options.map((opt) => {
        const selected = opt.id === selectedId;
        const price = opt.deliveryPrice ?? opt.baseDeliveryPrice;
        const priceNum =
          typeof price === 'string' ? Number(price) : typeof price === 'number' ? price : null;
        return (
          <Pressable
            key={opt.id}
            onPress={() => onPick(opt)}
            style={({ pressed }) => [
              styles.optionRow,
              selected && styles.optionRowSelected,
              pressed && { opacity: 0.85 },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.optionLabel,
                  selected && { color: colors.brand.red, fontFamily: fontFamilies.bodyExtraBold },
                ]}
              >
                {opt.nameAr}
              </Text>
              {opt.nameEn ? <Text style={styles.optionSub}>{opt.nameEn}</Text> : null}
            </View>
            {showPrice && priceNum != null && Number.isFinite(priceNum) ? (
              <MoneyText amount={priceNum} size="sm" tone="muted" />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  heading: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.headingBlack,
    color: colors.text.muted,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldWrap: { gap: 4 },
  fieldLabel: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyBold,
    color: colors.text.secondary,
  },
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderColor: colors.line2,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  selectFieldActive: { borderColor: colors.brand.red },
  selectFieldDisabled: { backgroundColor: colors.surface, opacity: 0.6 },
  selectValue: {
    flex: 1,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.ink,
    textAlign: 'right',
  },
  priceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand.redLight,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  priceLabel: {
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.dangerLight,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  errorText: {
    flex: 1,
    color: colors.danger,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
    lineHeight: 18,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    marginBottom: spacing.xs,
  },
  optionRowSelected: {
    borderColor: colors.brand.red,
    backgroundColor: colors.brand.redLight,
  },
  optionLabel: {
    fontFamily: fontFamilies.bodyBold,
    color: colors.ink,
    fontSize: fontSizes.sm,
    textAlign: 'right',
  },
  optionSub: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.xs,
    marginTop: 2,
    textAlign: 'right',
  },
  emptyText: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.sm,
    textAlign: 'center',
  },
});
