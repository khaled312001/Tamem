/**
 * "الأقسام" — the global, cross-merchant in-store taxonomy on the home
 * (بيتزا / كريب / مشويات …). Tapping a tile opens every merchant's items in
 * that section, not one store's.
 *
 * These are admin-curated: the server returns only active sections that have
 * artwork AND products, ordered by the admin's sortOrder, so a tile never leads
 * to an empty list and never renders blank. When there are none, the whole
 * section disappears rather than showing an empty header.
 *
 * Distinct from CategoriesSection (which picks a STORE type — مطاعم/صيدليات);
 * this picks a PRODUCT kind across all stores.
 */
import { useQuery } from '@tanstack/react-query';
import { memo, useCallback } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '../../../lib/api';
import { LIST_PERF } from '../../../lib/listPerf';
import { colors, fontFamilies, radii, shadows, spacing } from '../../../theme/tokens';
import { SectionHeader } from './SectionHeader';

const TILE = 112;

export interface HomeProductSection {
  id: string;
  nameAr: string;
  imageUrl?: string | null;
  productCount: number;
}

const SectionTile = memo(function SectionTile({
  s,
  onPress,
}: {
  s: HomeProductSection;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tileWrap, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${s.nameAr} — ${s.productCount} منتج`}
    >
      <View style={styles.tile}>
        {s.imageUrl ? (
          <>
            <Image source={{ uri: s.imageUrl }} style={styles.tileImg} resizeMode="cover" />
            <View style={styles.scrim} />
          </>
        ) : (
          <View style={styles.tileFallback} />
        )}
        <Text style={styles.overlayLabel} numberOfLines={1}>
          {s.nameAr}
        </Text>
      </View>
      <Text style={styles.count} numberOfLines={1}>
        {s.productCount} صنف
      </Text>
    </Pressable>
  );
});

interface Props {
  onPressSection: (section: HomeProductSection) => void;
}

function SectionsSectionBase({ onPressSection }: Props) {
  const { data } = useQuery<HomeProductSection[]>({
    queryKey: ['home-product-sections'],
    queryFn: () =>
      api.raw
        .get('/product-sections/featured')
        .then((r) => (r.data?.data ?? []) as HomeProductSection[]),
    staleTime: 5 * 60_000,
  });

  const sections = data ?? [];

  const renderItem = useCallback(
    ({ item }: { item: HomeProductSection }) => (
      <SectionTile s={item} onPress={() => onPressSection(item)} />
    ),
    [onPressSection],
  );
  const keyExtractor = useCallback((s: HomeProductSection) => s.id, []);

  if (sections.length === 0) return null;

  return (
    <View>
      <SectionHeader title="الأقسام" />

      <FlatList
        data={sections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listPad}
        {...LIST_PERF}
      />
    </View>
  );
}

export const SectionsSection = memo(SectionsSectionBase);

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    fontSize: 18,
    color: colors.brand.dark,
    fontFamily: fontFamilies.headingBold,
    lineHeight: 28,
    includeFontPadding: false,
    textAlign: 'auto',
  },
  listPad: { paddingHorizontal: spacing.lg, gap: spacing.md },

  tileWrap: { width: TILE, alignItems: 'center' },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: '#F6F0EC',
    justifyContent: 'flex-end',
    ...shadows.sm,
  },
  tileImg: { ...StyleSheet.absoluteFillObject, width: TILE, height: TILE },
  tileFallback: { ...StyleSheet.absoluteFillObject, backgroundColor: '#F1E7E1' },
  // Bottom gradient-ish scrim so the white label stays readable over any photo.
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  overlayLabel: {
    color: colors.white,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: 14,
    lineHeight: 22,
    includeFontPadding: false,
    textAlign: 'center',
    paddingHorizontal: 6,
    paddingBottom: 8,
  },
  count: {
    marginTop: 6,
    fontSize: 11,
    color: colors.brand.gray,
    fontFamily: fontFamilies.body,
    lineHeight: 16,
    includeFontPadding: false,
  },
  pressed: { opacity: 0.85 },
});
