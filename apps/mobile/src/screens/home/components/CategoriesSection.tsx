/**
 * "بتفكر في إيه النهاردة؟" — the category picker.
 *
 * Two things make this useful rather than decorative:
 *
 * 1. Each tile shows how many stores are actually behind it, counted from the
 *    merchant list the screen has already loaded — no extra request.
 * 2. Categories with no stores are dropped. Tapping through to an empty list is
 *    worse than not offering the tile, and with a young catalogue most
 *    categories have nothing in them yet.
 *
 * Falls back to `iconFor` (the existing Arabic-keyword icon picker) when a
 * category has no uploaded artwork, so a tile is never blank.
 */
import { memo, useCallback, useMemo } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { iconFor } from '../../../components/home/CategoriesStrip';
import { colors, fontFamilies, radii, shadows, spacing } from '../../../theme/tokens';
import type { HomeCategory, Merchant } from '../homeData';

const ROW = 'row' as const;
const TILE = 104;

/** Rotating tints so a row of icon-only tiles doesn't read as one grey block. */
const TINTS = ['#FFF1F0', '#FFF4E8', '#FFF8DF', '#EFFAF3', '#F1F4FF', '#FDF0F7'];
const FGS = ['#E0301E', '#EC7A2C', '#D49316', '#20A85B', '#3B6FE0', '#C2418B'];

interface CategoryWithCount extends HomeCategory {
  count: number;
}

const CategoryTile = memo(function CategoryTile({
  c,
  index,
  onPress,
}: {
  c: CategoryWithCount;
  index: number;
  onPress: () => void;
}) {
  const Icon = iconFor(c.nameAr);
  const bg = TINTS[index % TINTS.length];
  const fg = FGS[index % FGS.length];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tileWrap, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${c.nameAr} — ${c.count} محل`}
    >
      <View style={[styles.tile, { backgroundColor: bg }]}>
        {c.iconUrl ? (
          <>
            <Image source={{ uri: c.iconUrl }} style={styles.tileImg} resizeMode="cover" />
            {/* Scrim so the white label stays readable over a bright photo. */}
            <View style={styles.scrim} />
          </>
        ) : (
          <Icon size={40} color={fg} strokeWidth={1.6} />
        )}

        {/* With artwork the name sits ON the tile, like the reference. Without
            it, the tile is just an icon and the name goes underneath. */}
        {!!c.iconUrl && (
          <Text style={styles.overlayLabel} numberOfLines={1}>
            {c.nameAr}
          </Text>
        )}
      </View>

      {!c.iconUrl && (
        <Text style={styles.label} numberOfLines={1}>
          {c.nameAr}
        </Text>
      )}
      <Text style={styles.count} numberOfLines={1}>
        {c.count} محل
      </Text>
    </Pressable>
  );
});

interface Props {
  categories: HomeCategory[];
  /** Used only to count stores per category — no extra fetch. */
  merchants: Merchant[];
  onPressCategory: (c: HomeCategory) => void;
  onPressSeeAll: () => void;
}

function CategoriesSectionBase({ categories, merchants, onPressCategory, onPressSeeAll }: Props) {
  const withCounts = useMemo<CategoryWithCount[]>(() => {
    const counts = new Map<string, number>();
    for (const m of merchants) {
      const id = m.category?.id;
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return categories
      .map((c) => ({ ...c, count: counts.get(c.id) ?? 0 }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [categories, merchants]);

  const renderItem = useCallback(
    ({ item, index }: { item: CategoryWithCount; index: number }) => (
      <CategoryTile c={item} index={index} onPress={() => onPressCategory(item)} />
    ),
    [onPressCategory],
  );
  const keyExtractor = useCallback((c: CategoryWithCount) => c.id, []);

  if (!withCounts.length) return null;

  return (
    <View>
      <View style={[styles.header, { flexDirection: ROW }]}>
        <Text style={styles.sectionTitle}>بتفكر في إيه النهاردة؟</Text>
        <Pressable onPress={onPressSeeAll} hitSlop={8} accessibilityRole="button">
          <Text style={styles.seeAll}>عرض الكل</Text>
        </Pressable>
      </View>

      <FlatList
        data={withCounts}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

export const CategoriesSection = memo(CategoriesSectionBase);

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyExtraBold,
    textAlign: 'auto',
  },
  seeAll: {
    fontSize: 13,
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyBold,
  },

  list: { gap: spacing.md, paddingVertical: 2 },
  tileWrap: { width: TILE, alignItems: 'center' },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...shadows.sm,
  },
  tileImg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(36,19,16,0.32)' },
  overlayLabel: {
    position: 'absolute',
    bottom: 8,
    left: 6,
    right: 6,
    color: colors.white,
    fontSize: 13,
    fontFamily: fontFamilies.bodyExtraBold,
    textAlign: 'center',
  },
  label: {
    marginTop: 6,
    fontSize: 13,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyExtraBold,
    textAlign: 'center',
  },
  count: {
    fontSize: 11,
    color: colors.brand.gray,
    fontFamily: fontFamilies.body,
    textAlign: 'center',
  },
  pressed: { opacity: 0.75 },
});
