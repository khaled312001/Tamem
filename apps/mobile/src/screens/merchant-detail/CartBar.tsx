/**
 * Sticky cart bar pinned to the bottom of the store page.
 *
 * Shows the WHOLE cart, not just this store's lines — the cart is cross-store
 * (it groups by merchant at checkout), so showing a per-store subtotal here
 * would understate what the customer is about to pay.
 */
import { ChevronLeft, ShoppingCart } from 'lucide-react-native';
import { memo } from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, radii, shadows, spacing } from '../../theme/tokens';

const ROW = 'row' as const;

interface Props {
  count: number;
  subtotal: number;
  onPress: () => void;
}

function CartBarBase({ count, subtotal, onPress }: Props) {
  if (count <= 0) return null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.bar, shadows.md, pressed && { opacity: 0.92 }]}
      accessibilityRole="button"
      accessibilityLabel={`عرض السلة، ${count} منتج`}
    >
      <View style={[styles.badgeWrap, { flexDirection: ROW }]}>
        <ShoppingCart size={20} color={colors.white} />
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      </View>

      <Text style={styles.summary} numberOfLines={1}>
        {count} منتج · {subtotal.toLocaleString('ar-EG')} ج.م
      </Text>

      <View style={[styles.cta, { flexDirection: ROW }]}>
        <Text style={styles.ctaText}>عرض السلة</Text>
        <ChevronLeft
          size={16}
          color={colors.brand.red}
          // The chevron must point the way the user is going, which flips
          // with the layout direction.
          style={I18nManager.isRTL ? undefined : { transform: [{ rotate: '180deg' }] }}
        />
      </View>
    </Pressable>
  );
}

export const CartBar = memo(CartBarBase);

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    bottom: spacing.md,
    insetInlineStart: spacing.lg,
    insetInlineEnd: spacing.lg,
    flexDirection: ROW,
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand.red,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  badgeWrap: { alignItems: 'center' },
  badge: {
    position: 'absolute',
    top: -6,
    insetInlineEnd: -8,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, color: colors.brand.red, fontFamily: fontFamilies.bodyExtraBold },

  summary: {
    flex: 1,
    color: colors.white,
    fontSize: 14,
    fontFamily: fontFamilies.bodyExtraBold,
    textAlign: 'center',
  },

  cta: {
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  ctaText: { fontSize: 12, color: colors.brand.red, fontFamily: fontFamilies.bodyExtraBold },
});
