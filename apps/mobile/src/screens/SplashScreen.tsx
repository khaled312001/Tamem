import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft } from 'lucide-react-native';
import { useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

interface SplashScreenProps {
  /**
   * When provided, renders the "ابدأ الآن" CTA that calls this on press.
   * When omitted, the splash is a pure hydration/loading state (animated dots).
   */
  onStart?: () => void;
}

/**
 * Brand splash / intro. Fully rebuilt: a warm brand gradient, a soft breathing
 * halo behind a clean logo card, staggered reanimated entrance, and a modern
 * pill CTA. No portrait badge, no loose dots overlapping the mark.
 */
export function SplashScreen({ onStart }: SplashScreenProps = {}) {
  // Breathing halo behind the logo + a gentle CTA pulse. Shared values so the
  // loops live on the UI thread and stop cleanly on unmount.
  const halo = useSharedValue(0.92);
  const ctaPulse = useSharedValue(1);
  const d1 = useSharedValue(0.3);
  const d2 = useSharedValue(0.3);
  const d3 = useSharedValue(0.3);

  useEffect(() => {
    halo.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 1700, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.92, { duration: 1700, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
    if (onStart) {
      ctaPulse.value = withRepeat(
        withSequence(
          withTiming(1.035, { duration: 1000, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      );
    } else {
      const bounce = (v: typeof d1, delay: number) =>
        (v.value = withRepeat(
          withSequence(
            withTiming(0.3, { duration: delay }),
            withTiming(1, { duration: 380 }),
            withTiming(0.3, { duration: 380 }),
          ),
          -1,
        ));
      bounce(d1, 0);
      bounce(d2, 160);
      bounce(d3, 320);
    }
  }, [onStart, halo, ctaPulse, d1, d2, d3]);

  const haloStyle = useAnimatedStyle(() => ({ transform: [{ scale: halo.value }] }));
  const ctaStyle = useAnimatedStyle(() => ({ transform: [{ scale: ctaPulse.value }] }));
  const dot1Style = useAnimatedStyle(() => ({ opacity: d1.value }));
  const dot2Style = useAnimatedStyle(() => ({ opacity: d2.value }));
  const dot3Style = useAnimatedStyle(() => ({ opacity: d3.value }));

  return (
    <View style={styles.container}>
      {/* Warm diagonal brand gradient */}
      <LinearGradient
        colors={['#F0863B', '#E0301E', '#9E1D11']}
        locations={[0, 0.5, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Soft light blooms for depth */}
      <View style={[styles.bloom, styles.bloomTop]} />
      <View style={[styles.bloom, styles.bloomBottom]} />

      {/* ── Center: logo + wordmark + tagline ── */}
      <View style={styles.content}>
        <Animated.View entering={ZoomIn.springify().damping(13).mass(0.9)} style={styles.logoWrap}>
          <Animated.View style={[styles.halo, haloStyle]} />
          <View style={styles.logoCard}>
            <Image
              source={require('../assets/logo-clean.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(220).duration(600)} style={styles.brandWrap}>
          <Text style={styles.brandEn}>Delivery Tamem</Text>
          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.brandAr}>تميم للتوصيل</Text>
            <View style={styles.divider} />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(400).duration(600)} style={styles.taglineWrap}>
          <Text style={styles.tagline}>أسرع توصيل وشحن في الصعيد 🚀</Text>
        </Animated.View>
      </View>

      {/* ── Bottom: CTA or loading dots ── */}
      <View style={styles.bottom}>
        {onStart ? (
          <Animated.View
            entering={FadeInUp.delay(600).duration(600)}
            style={[styles.ctaWrap, ctaStyle]}
          >
            <Pressable
              onPress={onStart}
              style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            >
              <Text style={styles.ctaText}>ابدأ الآن</Text>
              <ArrowLeft size={20} color={colors.brand.red} strokeWidth={2.6} />
            </Pressable>
            <Text style={styles.ctaHint}>اضغط للمتابعة لإنشاء حساب أو تسجيل الدخول</Text>
          </Animated.View>
        ) : (
          <View style={styles.dotsRow}>
            <Animated.View style={[styles.dotGold, dot1Style]} />
            <Animated.View style={[styles.dot, dot2Style]} />
            <Animated.View style={[styles.dot, dot3Style]} />
          </View>
        )}
      </View>
    </View>
  );
}

const CARD = 200;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.brand.red,
    justifyContent: 'space-between',
    paddingTop: spacing.xxl * 1.4,
    paddingBottom: spacing.xxl,
  },
  bloom: { position: 'absolute', borderRadius: 999 },
  bloomTop: {
    top: -120,
    right: -90,
    width: 320,
    height: 320,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  bloomBottom: {
    bottom: -80,
    left: -70,
    width: 260,
    height: 260,
    backgroundColor: 'rgba(242,169,59,0.14)',
  },

  content: { alignItems: 'center', paddingHorizontal: spacing.xl },

  logoWrap: {
    width: CARD + 60,
    height: CARD + 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: CARD + 56,
    height: CARD + 56,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  logoCard: {
    width: CARD,
    height: CARD,
    borderRadius: 44,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    boxShadow: '0 20px 40px rgba(120,20,10,0.45)',
    elevation: 16,
  },
  logo: { width: '100%', height: '100%' },

  brandWrap: { alignItems: 'center', marginTop: spacing.xxl },
  brandEn: {
    color: colors.white,
    fontSize: 32,
    fontFamily: fontFamilies.headingDisplay,
    letterSpacing: 0.5,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  divider: {
    width: 28,
    height: 2,
    borderRadius: 2,
    backgroundColor: colors.brand.gold,
    opacity: 0.85,
  },
  brandAr: {
    color: colors.brand.gold,
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.headingBold,
    letterSpacing: 1,
  },

  taglineWrap: {
    marginTop: spacing.xl,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  tagline: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyBold,
    textAlign: 'center',
  },

  bottom: { alignItems: 'center', paddingHorizontal: spacing.xl },
  ctaWrap: { alignItems: 'center', width: '100%' },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.xxl,
    borderRadius: radii.pill,
    minWidth: 240,
    boxShadow: '0 12px 30px rgba(158,29,17,0.5)',
    elevation: 12,
  },
  ctaPressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  ctaText: {
    color: colors.brand.red,
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.headingBold,
  },
  ctaHint: {
    marginTop: spacing.md,
    color: 'rgba(255,255,255,0.75)',
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.body,
    textAlign: 'center',
  },

  dotsRow: { flexDirection: 'row', gap: 9 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.white },
  dotGold: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: colors.brand.gold,
    boxShadow: '0 0 10px rgba(242,169,59,0.6)',
  },
});
