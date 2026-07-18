import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, radii, shadows, spacing } from '../../theme/tokens';

/**
 * Hero coupon banner. A red→orange gradient carries the discount copy + code
 * chip on the LEFT (clean space, never over the artwork), while the rider
 * artwork sits on the RIGHT — matching the approved design. Title/discount/code
 * are admin-controlled; the artwork is fixed brand collateral. Carousel dots
 * hint at multiple promos.
 */
export function CouponBanner({
  discountText,
  subtitle,
  code,
  onPress,
}: {
  /** e.g. "خصم 20%". */
  discountText: string;
  /** e.g. "على أول طلب". */
  subtitle: string;
  code: string;
  onPress?: () => void;
}) {
  return (
    <View>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.wrap, shadows.md, pressed && { opacity: 0.95 }]}
      >
        <LinearGradient
          colors={['#E0301E', '#F0562A', '#F2A93B']}
          start={{ x: 0, y: 0.2 }}
          end={{ x: 1, y: 0.9 }}
          style={styles.bg}
        >
          {/* Rider artwork, right-anchored. contain keeps the whole rider
              visible; its own red backdrop blends into the gradient. */}
          <Image
            source={require('../../assets/home/coupon-banner.png')}
            style={styles.rider}
            resizeMode="contain"
          />

          {/* Copy on the clean left space. */}
          <View style={styles.copy}>
            <Text style={styles.discount} numberOfLines={2}>
              {discountText}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
            <View style={styles.codeChip}>
              <Text style={styles.codeText}>{code}</Text>
            </View>
            <Text style={styles.hint}>استخدم الكود عند الدفع</Text>
            <Text style={styles.limited}>* لفترة محدودة</Text>
          </View>
        </LinearGradient>
      </Pressable>

      {/* Carousel dots — first active. */}
      <View style={styles.dots}>
        <View style={[styles.dot, styles.dotActive]} />
        <View style={styles.dot} />
        <View style={styles.dot} />
        <View style={styles.dot} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.md,
    borderRadius: radii.xl,
    overflow: 'hidden',
    height: 172,
  },
  bg: { flex: 1, justifyContent: 'center' },
  rider: {
    position: 'absolute',
    right: -6,
    top: 0,
    bottom: 0,
    width: '58%',
    height: '100%',
  },
  copy: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    width: '52%',
    alignSelf: 'flex-end',
  },
  discount: {
    fontFamily: fontFamilies.headingBlack,
    fontSize: 25,
    color: colors.white,
    textAlign: 'right',
    lineHeight: 34,
  },
  subtitle: {
    fontFamily: fontFamilies.headingBold,
    fontSize: 17,
    color: colors.white,
    textAlign: 'right',
    marginTop: 1,
  },
  codeChip: {
    backgroundColor: colors.brand.gold,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    marginTop: spacing.sm,
  },
  codeText: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: 16,
    color: colors.brand.dark,
    letterSpacing: 1.5,
  },
  hint: {
    fontFamily: fontFamilies.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  limited: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 10,
    color: colors.brand.gold,
    textAlign: 'right',
    marginTop: 2,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    marginTop: spacing.sm,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { width: 18, backgroundColor: colors.brand.red },
});
