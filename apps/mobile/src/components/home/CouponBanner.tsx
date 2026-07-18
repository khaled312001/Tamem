import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, radii, shadows, spacing } from '../../theme/tokens';

/**
 * Hero coupon banner — the branded rider artwork with the active discount and
 * code overlaid on the left, exactly per the approved design:
 *   خصم <20%> / على أول طلب  ·  [ CODE ]  ·  استخدم الكود عند الدفع  ·  * لفترة محدودة
 * Title/discount/code are admin-controlled (home-config / Coupons table); the
 * artwork is fixed brand collateral. Carousel dots hint at multiple promos.
 */
export function CouponBanner({
  discountText,
  subtitle,
  code,
  onPress,
}: {
  /** e.g. "خصم 20%" — the headline discount. */
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
        <ImageBackground
          source={require('../../assets/home/coupon-banner.png')}
          style={styles.bg}
          imageStyle={styles.bgImage}
          resizeMode="cover"
        >
          <View style={styles.overlay}>
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
        </ImageBackground>
      </Pressable>

      {/* Carousel dots — first active, matching the mockup. */}
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
    height: 168,
  },
  bg: { flex: 1, justifyContent: 'center' },
  bgImage: { borderRadius: radii.xl },
  overlay: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    maxWidth: '58%',
  },
  discount: {
    fontFamily: fontFamilies.headingBlack,
    fontSize: 24,
    color: colors.white,
    textAlign: 'right',
    lineHeight: 32,
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
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  dotActive: {
    width: 18,
    backgroundColor: colors.brand.red,
  },
});
