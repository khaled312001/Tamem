/**
 * "ممكن تحتاج كمان" — a small horizontal rail under each merchant's cart
 * section, offering things people forget: the cola, the water, the dessert.
 *
 * The suggestions are chosen by the server from the merchant's own catalogue
 * with no admin curation, because a curated list nobody fills is an empty rail
 * — worse than a decent guess. See the /suggestions route.
 *
 * Renders nothing when there's nothing to suggest (a store with two products,
 * both already in the cart), and re-asks whenever the cart contents change so
 * an item never appears in both the cart and the "you might also want" strip.
 */
import { useQuery } from '@tanstack/react-query';
import { Plus, ShoppingBasket } from 'lucide-react-native';
import { memo, useCallback } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '../../lib/api';
import { LIST_PERF } from '../../lib/listPerf';
import { productPrice } from '../../lib/productPrice';
import { addToCart } from '../../stores/cart';
import { colors, fontFamilies, radii, shadows, spacing } from '../../theme/tokens';

const CARD_W = 124;
const IMG_H = 76;

interface Suggestion {
  id: string;
  nameAr: string;
  price: number | string;
  salePrice?: number | string | null;
  discount?: number | string | null;
  imageUrl?: string | null;
  hasOptions?: boolean;
  fromPrice?: number | null;
}

interface Props {
  merchantId: string;
  merchantNameAr: string;
  /** Product ids already in the cart for this merchant — never suggest those. */
  excludeIds: string[];
  disabled?: boolean;
  /** Products with sizes can't be quick-added; they open their page instead. */
  onOpenProduct: (productId: string) => void;
}

function SuggestionsRailBase({
  merchantId,
  merchantNameAr,
  excludeIds,
  disabled,
  onOpenProduct,
}: Props) {
  const exclude = excludeIds.slice().sort().join(',');

  const { data } = useQuery<Suggestion[]>({
    queryKey: ['cart-suggestions', merchantId, exclude],
    queryFn: async () => {
      const r = await api.raw.get(`/merchants/${merchantId}/suggestions`, {
        params: { limit: 8, exclude },
      });
      return (r.data?.data ?? []) as Suggestion[];
    },
    // The catalogue doesn't move while someone is checking out.
    staleTime: 5 * 60_000,
  });

  const items = data ?? [];

  const renderItem = useCallback(
    ({ item }: { item: Suggestion }) => {
      const price = productPrice(item);
      const from = item.fromPrice != null ? Number(item.fromPrice) : null;
      const showFrom = from != null && Number.isFinite(from) && from > 0;

      const onPress = () => {
        if (disabled) return;
        // Same rule as the store page: a sized product has no single price to
        // add, so it opens the picker.
        if (item.hasOptions) {
          onOpenProduct(item.id);
          return;
        }
        addToCart({
          product: {
            id: item.id,
            nameAr: item.nameAr,
            price: price.now,
            imageUrl: item.imageUrl ?? null,
          },
          merchantId,
          merchantNameAr,
        });
      };

      return (
        <Pressable
          onPress={onPress}
          disabled={disabled}
          style={({ pressed }) => [styles.card, shadows.sm, pressed && { opacity: 0.9 }]}
          accessibilityRole="button"
          accessibilityLabel={item.hasOptions ? `اختر حجم ${item.nameAr}` : `أضف ${item.nameAr}`}
        >
          <View style={styles.imgWrap}>
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.img} resizeMode="cover" />
            ) : (
              <ShoppingBasket size={20} color={colors.brand.red} />
            )}
            <View style={[styles.addDot, disabled && styles.addDotOff]}>
              <Plus size={13} color={colors.white} strokeWidth={3} />
            </View>
          </View>

          <Text style={styles.name} numberOfLines={2}>
            {item.nameAr}
          </Text>
          <Text style={styles.price} numberOfLines={1}>
            {showFrom ? 'من ' : ''}
            {(showFrom ? from : price.now).toLocaleString('ar-EG')} ج.م
          </Text>
        </Pressable>
      );
    },
    [disabled, merchantId, merchantNameAr, onOpenProduct],
  );

  if (items.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>ممكن تحتاج كمان</Text>
      <FlatList
        data={items}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listPad}
        {...LIST_PERF}
      />
    </View>
  );
}

export const SuggestionsRail = memo(SuggestionsRailBase);

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.sm },
  title: {
    fontSize: 13,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyExtraBold,
    lineHeight: 21,
    includeFontPadding: false,
    textAlign: 'auto',
    marginBottom: spacing.sm,
  },
  listPad: { gap: spacing.sm, paddingVertical: 2 },

  card: {
    width: CARD_W,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#EFE7E2',
    padding: spacing.sm,
    gap: 2,
  },
  imgWrap: {
    height: IMG_H,
    borderRadius: radii.sm,
    backgroundColor: '#F6F0EC',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 4,
  },
  img: { width: '100%', height: '100%' },
  // Sits inside the image box (not absolutely positioned over the card) so it
  // can't be clipped by the rounded corner on Android.
  addDot: {
    position: 'absolute',
    bottom: 4,
    insetInlineEnd: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.brand.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addDotOff: { backgroundColor: '#C9C0BB' },

  name: {
    fontSize: 12,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyBold,
    lineHeight: 19,
    includeFontPadding: false,
    textAlign: 'auto',
    minHeight: 38,
  },
  price: {
    fontSize: 12,
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
    lineHeight: 20,
    includeFontPadding: false,
    textAlign: 'auto',
  },
});
