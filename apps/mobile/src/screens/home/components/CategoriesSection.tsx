/**
 * Category grid (4 per row).
 *
 * Reuses `iconFor` from the existing CategoriesStrip so a category with no
 * uploaded artwork falls back to the exact same Arabic-keyword icon it does
 * today — no second heuristic to keep in sync.
 */
import { memo, useCallback } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { iconFor } from '../../../components/home/CategoriesStrip';
import { colors, fontFamilies, radii, spacing } from '../../../theme/tokens';
import type { HomeCategory } from '../homeData';

// React Native already lays `flexDirection: 'row'` out right-to-left when
// I18nManager RTL is on. Adding 'row-reverse' on top of that flips it a
// SECOND time, back to left-to-right — which is why the header rendered
// mirrored. Plain 'row' is correct on native; the web build gets its
// direction from the document's dir="rtl".
const ROW = 'row' as const;

interface Props {
  categories: HomeCategory[];
  onPressCategory: (c: HomeCategory) => void;
  onPressSeeAll: () => void;
}

const CategoryTile = memo(function CategoryTile({
  c,
  onPress,
}: {
  c: HomeCategory;
  onPress: () => void;
}) {
  const Icon = iconFor(c.nameAr);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tileWrap, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={c.nameAr}
    >
      <View style={styles.tile}>
        {c.iconUrl ? (
          <Image source={{ uri: c.iconUrl }} style={styles.tileImg} resizeMode="contain" />
        ) : (
          <Icon size={26} color={colors.brand.red} strokeWidth={1.8} />
        )}
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {c.nameAr}
      </Text>
    </Pressable>
  );
});

function CategoriesSectionBase({ categories, onPressCategory, onPressSeeAll }: Props) {
  const renderItem = useCallback(
    ({ item }: { item: HomeCategory }) => (
      <CategoryTile c={item} onPress={() => onPressCategory(item)} />
    ),
    [onPressCategory],
  );
  const keyExtractor = useCallback((c: HomeCategory) => c.id, []);

  if (!categories.length) return null;

  return (
    <View>
      <View style={[styles.header, { flexDirection: ROW }]}>
        <Text style={styles.sectionTitle}>التصنيفات</Text>
        <Pressable onPress={onPressSeeAll} hitSlop={8} accessibilityRole="button">
          <Text style={styles.seeAll}>عرض الكل</Text>
        </Pressable>
      </View>

      <FlatList
        data={categories}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={4}
        // Nested inside the page's ScrollView: this grid is short and fully
        // rendered, so it must not try to scroll on its own.
        scrollEnabled={false}
        columnWrapperStyle={styles.column}
        contentContainerStyle={styles.grid}
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
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  seeAll: {
    fontSize: 13,
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyBold,
  },
  grid: { gap: spacing.md },
  column: { gap: spacing.md },

  tileWrap: { flex: 1, alignItems: 'center', gap: 6 },
  tile: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radii.md,
    backgroundColor: '#FFF5F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileImg: { width: '58%', height: '58%' },
  label: {
    fontSize: 12,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyBold,
    textAlign: 'center',
  },
  pressed: { opacity: 0.75 },
});
