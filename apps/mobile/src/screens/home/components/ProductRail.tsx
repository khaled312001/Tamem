/**
 * Horizontal product rail — used by both "الأكثر طلباً" (an admin-curated list)
 * and "عروض اليوم" (whatever is actually discounted right now).
 *
 * One component for both because they differ only in where the products come
 * from, not in how a product should look.
 *
 * Renders nothing at all when empty. A section header over a blank strip reads
 * as a loading failure, and "عروض اليوم" is legitimately empty whenever nothing
 * is on sale.
 */
import { memo, useCallback } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { LIST_PERF } from '../../../lib/listPerf';
import { productPrice } from '../../../lib/productPrice';
import { colors, fontFamilies, radii, shadows, spacing } from '../../../theme/tokens';
import type { HomeProduct } from '../homeData';

const ROW = 'row' as const;
const CARD_W = 156;
const IMG_H = 116;

const ProductCard = memo(function ProductCard({
  product: p,
  onPress,
}: {
  product: HomeProduct;
  onPress: () => void;
}) {
  const { now, was, off } = productPrice(p);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={p.nameAr}
    >
      <View style={styles.imgWrap}>
        {p.imageUrl ? (
          <Image source={{ uri: p.imageUrl }} style={styles.img} resizeMode="cover" />
        ) : (
          <View style={styles.imgFallback} />
        )}
        {off > 0 && (
          <View style={styles.offBadge}>
            <Text style={styles.offText}>-{off}%</Text>
          </View>
        )}
      </View>

      <Text style={styles.name} numberOfLines={2}>
        {p.nameAr}
      </Text>

      {!!p.merchant?.storeNameAr && (
        <Text style={styles.store} numberOfLines={1}>
          {p.merchant.storeNameAr}
        </Text>
      )}

      <View style={[styles.priceRow, { flexDirection: ROW }]}>
        <Text style={styles.price}>{Math.round(now).toLocaleString('ar-EG')} ج.م</Text>
        {was != null && <Text style={styles.was}>{Math.round(was).toLocaleString('ar-EG')}</Text>}
      </View>
    </Pressable>
  );
});

interface Props {
  title: string;
  subtitle?: string;
  products: HomeProduct[];
  onPressProduct: (p: HomeProduct) => void;
  onPressSeeAll?: () => void;
}

function ProductRailBase({ title, subtitle, products, onPressProduct, onPressSeeAll }: Props) {
  const renderItem = useCallback(
    ({ item }: { item: HomeProduct }) => (
      <ProductCard product={item} onPress={() => onPressProduct(item)} />
    ),
    [onPressProduct],
  );
  const keyExtractor = useCallback((p: HomeProduct) => p.id, []);

  if (!products.length) return null;

  return (
    <View>
      <View style={[styles.header, { flexDirection: ROW }]}>
        <View style={styles.headerText}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {!!subtitle && <Text style={styles.sectionSub}>{subtitle}</Text>}
        </View>
        {!!onPressSeeAll && (
          <Pressable onPress={onPressSeeAll} hitSlop={8} accessibilityRole="button">
            <Text style={styles.seeAll}>عرض الكل</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        {...LIST_PERF}
        data={products}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

export const ProductRail = memo(ProductRailBase);

const styles = StyleSheet.create({
  header: { alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  headerText: { flex: 1 },
  sectionTitle: {
    fontSize: 18,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyExtraBold,
    lineHeight: 27,
    includeFontPadding: false,
    textAlign: 'auto',
  },
  sectionSub: {
    fontSize: 12,
    color: colors.brand.gray,
    fontFamily: fontFamilies.body,
    lineHeight: 18,
    includeFontPadding: false,
    textAlign: 'auto',
  },
  seeAll: { fontSize: 13, color: colors.brand.red, fontFamily: fontFamilies.bodyBold },

  list: { gap: spacing.md, paddingVertical: 2 },
  card: {
    width: CARD_W,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#EFE7E2',
    padding: spacing.sm,
    ...shadows.sm,
  },
  imgWrap: {
    height: IMG_H,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: '#F6F0EC',
    marginBottom: spacing.sm,
  },
  img: { width: '100%', height: '100%' },
  imgFallback: { flex: 1, backgroundColor: '#F1EBE7' },
  offBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: colors.brand.red,
    borderRadius: radii.sm,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  offText: { color: colors.white, fontSize: 11, fontFamily: fontFamilies.bodyExtraBold },

  name: {
    fontSize: 13,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyExtraBold,
    // Arabic ascenders clip at anything under ~1.5x.
    lineHeight: 20,
    includeFontPadding: false,
    textAlign: 'auto',
    minHeight: 40,
  },
  store: {
    fontSize: 11,
    color: colors.brand.gray,
    fontFamily: fontFamilies.body,
    lineHeight: 17,
    includeFontPadding: false,
    textAlign: 'auto',
  },
  priceRow: { alignItems: 'center', gap: 6, marginTop: 4 },
  price: {
    fontSize: 14,
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
    lineHeight: 21,
    includeFontPadding: false,
  },
  was: {
    fontSize: 11,
    color: colors.brand.gray,
    fontFamily: fontFamilies.body,
    textDecorationLine: 'line-through',
    lineHeight: 17,
    includeFontPadding: false,
  },
  pressed: { opacity: 0.88 },
});
