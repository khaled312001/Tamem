import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, fontSizes, gradients, radii, spacing } from '../theme/tokens';

export function SplashScreen() {
  const pulse = useRef(new Animated.Value(0.85)).current;
  const dot1 = useRef(new Animated.Value(0.4)).current;
  const dot2 = useRef(new Animated.Value(0.4)).current;
  const dot3 = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.05, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.85, duration: 1400, useNativeDriver: true }),
      ]),
    ).start();

    const seq = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0.4, duration: 350, useNativeDriver: true }),
        ]),
      );
    seq(dot1, 0).start();
    seq(dot2, 200).start();
    seq(dot3, 400).start();
  }, [pulse, dot1, dot2, dot3]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={gradients.splash}
        locations={[0, 0.18, 0.4, 0.85]}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Top gold accent line */}
      <LinearGradient
        colors={['transparent', '#F2A93B', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.accentLine}
      />

      {/* Decorative circles */}
      <View style={[styles.circle, styles.circle1]} />
      <View style={[styles.circle, styles.circle2]} />
      <View style={[styles.circle, styles.circle3]} />

      <View style={styles.center}>
        {/* Rider photo + logo badge composition */}
        <View style={styles.riderBlock}>
          <Animated.View style={[styles.glow, { transform: [{ scale: pulse }] }]} />
          <View style={styles.goldRing} />

          <View style={styles.riderFrame}>
            <Image
              source={require('../assets/delivery-rider.png')}
              style={styles.riderImage}
              resizeMode="cover"
            />
          </View>

          {/* Tamem logo badge — overlapping bottom-right, slight tilt */}
          <View style={styles.logoBadge}>
            <Image
              source={require('../assets/logo.jpg')}
              style={styles.logoBadgeImg}
              resizeMode="contain"
            />
          </View>
        </View>

        <View style={styles.brandWrap}>
          <Text style={styles.brand}>TAMEM</Text>
          <View style={styles.deliveryRow}>
            <View style={styles.line} />
            <Text style={styles.delivery}>DELIVERY</Text>
            <View style={styles.line} />
          </View>
        </View>

        <View style={styles.tagline}>
          <Text style={styles.taglineIcon}>🛵</Text>
          <Text style={styles.taglineText}>تميم… التوصيل لعبتنا</Text>
        </View>
      </View>

      <View style={styles.dotsRow}>
        <Animated.View style={[styles.dotGold, { opacity: dot1 }]} />
        <Animated.View style={[styles.dot, { opacity: dot2 }]} />
        <Animated.View style={[styles.dot, { opacity: dot3 }]} />
      </View>
    </View>
  );
}

const RIDER_SIZE = 220;
const BADGE_SIZE = 76;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.brand.redDark, justifyContent: 'center' },
  accentLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  circle: { position: 'absolute', borderRadius: 999 },
  circle1: {
    top: -40,
    right: -40,
    width: 180,
    height: 180,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  circle2: {
    top: 30,
    right: 20,
    width: 120,
    height: 120,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  circle3: {
    bottom: 100,
    left: -30,
    width: 140,
    height: 140,
    backgroundColor: 'rgba(236,122,44,0.08)',
  },
  center: { alignItems: 'center', paddingHorizontal: spacing.xl },

  riderBlock: {
    width: RIDER_SIZE + 30,
    height: RIDER_SIZE + 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    position: 'relative',
  },
  glow: {
    position: 'absolute',
    width: RIDER_SIZE + 60,
    height: RIDER_SIZE + 60,
    borderRadius: 999,
    backgroundColor: 'rgba(242,169,59,0.18)',
  },
  goldRing: {
    position: 'absolute',
    width: RIDER_SIZE + 12,
    height: RIDER_SIZE + 12,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(242,169,59,0.4)',
  },
  riderFrame: {
    width: RIDER_SIZE,
    height: RIDER_SIZE,
    borderRadius: RIDER_SIZE / 2,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 14,
  },
  riderImage: { width: '100%', height: '100%' },
  logoBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    padding: 6,
    transform: [{ rotate: '-6deg' }],
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
    zIndex: 3,
  },
  logoBadgeImg: { width: '100%', height: '100%' },

  brandWrap: { alignItems: 'center', marginTop: spacing.md },
  brand: {
    color: colors.white,
    fontSize: 38,
    fontFamily: fontFamilies.headingBlack,
    letterSpacing: 6,
  },
  deliveryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  line: { width: 26, height: 1.5, backgroundColor: colors.brand.gold, opacity: 0.7 },
  delivery: {
    color: colors.brand.gold,
    letterSpacing: 8,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  tagline: {
    marginTop: spacing.xl,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  taglineIcon: { fontSize: 14 },
  taglineText: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyBold,
  },
  dotsRow: {
    position: 'absolute',
    bottom: 60,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.white },
  dotGold: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brand.gold,
    shadowColor: colors.brand.gold,
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
});
