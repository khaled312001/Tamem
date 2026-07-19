/**
 * "المحلات اللي حواليك" — the vertical store list that carries the page.
 *
 * The horizontal rail above it is the admin's curated pick; this is the full
 * browsable list, closest first, and it's what makes the home screen feel like
 * a storefront instead of a menu.
 *
 * Filtering is client-side ON PURPOSE: the whole nearby set is already in
 * memory from the one `/merchants` call the screen makes, so a chip tap is
 * instant and costs no request. Sorting by rating/distance likewise.
 */
import { memo, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, radii, spacing } from '../../../theme/tokens';
import type { Merchant } from '../homeData';

import { StoreCard } from './StoreCard';

const ROW = 'row' as const;

export type StoreFilter = 'all' | 'open' | 'top' | 'nearest';

const FILTERS: { key: StoreFilter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'open', label: 'مفتوح الآن' },
  { key: 'top', label: 'الأعلى تقييماً' },
  { key: 'nearest', label: 'الأقرب لك' },
];

interface Props {
  merchants: Merchant[];
  /** Total matching stores per the server, which may exceed what's loaded. */
  total: number;
  hasLocation: boolean;
  filter: StoreFilter;
  onChangeFilter: (f: StoreFilter) => void;
  onPressMerchant: (m: Merchant) => void;
  /** How many to render before the "عرض المزيد" button. */
  visibleCount: number;
  onShowMore: () => void;
}

function NearbyStoresSectionBase({
  merchants,
  total,
  hasLocation,
  filter,
  onChangeFilter,
  onPressMerchant,
  visibleCount,
  onShowMore,
}: Props) {
  const filtered = useMemo(() => {
    const list = merchants.slice();
    if (filter === 'open') return list.filter((m) => m.openness?.isOpenNow ?? m.isOpen);
    if (filter === 'top') return list.sort((a, b) => Number(b.rating ?? 0) - Number(a.rating ?? 0));
    if (filter === 'nearest')
      return list.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
    return list;
  }, [merchants, filter]);

  const shown = filtered.slice(0, visibleCount);
  const remaining = filtered.length - shown.length;

  if (!merchants.length) return null;

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.title}>المحلات اللي حواليك</Text>
        <Text style={styles.subtitle}>
          {hasLocation
            ? `${total} محل قريب منك`
            : `${total} محل متاح — فعّل الموقع لترتيبها بالأقرب`}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {FILTERS.map((f) => {
          // Sorting by distance is meaningless without a fix.
          if (f.key === 'nearest' && !hasLocation) return null;
          const on = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => onChangeFilter(f.key)}
              style={[styles.chip, on && styles.chipOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {shown.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>لا توجد محلات مطابقة — جرّب فلتر تاني</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {shown.map((m) => (
            <StoreCard key={m.id} merchant={m} onPress={() => onPressMerchant(m)} />
          ))}
        </View>
      )}

      {remaining > 0 && (
        <Pressable onPress={onShowMore} style={styles.more} accessibilityRole="button">
          <Text style={styles.moreText}>عرض المزيد ({remaining})</Text>
        </Pressable>
      )}
    </View>
  );
}

export const NearbyStoresSection = memo(NearbyStoresSectionBase);

const styles = StyleSheet.create({
  header: { marginBottom: spacing.sm },
  title: {
    fontSize: 18,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyExtraBold,
    textAlign: 'auto',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    color: colors.brand.gray,
    fontFamily: fontFamilies.body,
    textAlign: 'auto',
  },

  chips: { gap: spacing.sm, paddingVertical: spacing.sm, flexDirection: ROW },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#EFE7E2',
  },
  chipOn: { backgroundColor: colors.brand.red, borderColor: colors.brand.red },
  chipText: { fontSize: 12, color: colors.brand.dark, fontFamily: fontFamilies.bodyBold },
  chipTextOn: { color: colors.white },

  list: { gap: spacing.md, marginTop: spacing.sm },

  more: {
    marginTop: spacing.md,
    paddingVertical: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#EFE7E2',
    backgroundColor: colors.white,
    alignItems: 'center',
  },
  moreText: { fontSize: 13, color: colors.brand.red, fontFamily: fontFamilies.bodyExtraBold },

  empty: { paddingVertical: spacing.xl, alignItems: 'center' },
  emptyText: { fontSize: 13, color: colors.brand.gray, fontFamily: fontFamilies.body },
});
