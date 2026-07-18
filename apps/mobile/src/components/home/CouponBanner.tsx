import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, radii, shadows, spacing } from '../../theme/tokens';

/**
 * Hero coupon banner — the branded rider artwork with the active discount and
 * code overlaid on the left. Title + code are admin-controlled (from
 * home-config / the Coupons table); the artwork is fixed brand collateral.
 * Tapping copies/opens the promo (handled by the caller).
 */
export function CouponBanner({
  title,
  code,
  onPress,
}: {
  title: string;
  code: string;
  onPress?: () => void;
}) {
  return (
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
        {/* Left scrim so the red artwork stays legible behind the copy. */}
        <View style={styles.overlay}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <View style={styles.codeChip}>
            <Text style={styles.codeText}>{code}</Text>
          </View>
          <Text style={styles.hint}>استخدم الكود عند الدفع</Text>
        </View>
      </ImageBackground>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.md,
    borderRadius: radii.lg,
    overflow: 'hidden',
    height: 150,
  },
  bg: { flex: 1, justifyContent: 'center' },
  bgImage: { borderRadius: radii.lg },
  overlay: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    maxWidth: '62%',
  },
  title: {
    fontFamily: fontFamilies.headingBlack,
    fontSize: 20,
    color: colors.white,
    textAlign: 'right',
    lineHeight: 28,
  },
  codeChip: {
    backgroundColor: colors.brand.gold,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    marginTop: 2,
  },
  codeText: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: 15,
    color: colors.brand.dark,
    letterSpacing: 1,
  },
  hint: {
    fontFamily: fontFamilies.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'right',
  },
});
