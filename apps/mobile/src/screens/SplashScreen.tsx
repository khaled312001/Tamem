import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, fontSizes, gradients, radii, spacing } from '../theme/tokens';

export function SplashScreen() {
  const pulse = useRef(new Animated.Value(0.8)).current;
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

      <View style={[styles.circle, styles.circle1]} />
      <View style={[styles.circle, styles.circle2]} />
      <View style={[styles.circle, styles.circle3]} />

      <View style={styles.center}>
        <View style={styles.logoBlock}>
          <Animated.View style={[styles.glow, { transform: [{ scale: pulse }] }]} />
          <View style={styles.logoFrame}>
            <Image
              source={require('../assets/logo.jpg')}
              style={styles.logo}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.brand.redDark, justifyContent: 'center' },
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
  logoBlock: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  glow: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 999,
    backgroundColor: 'rgba(242,169,59,0.15)',
  },
  logoFrame: {
    width: 200,
    height: 200,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 18,
  },
  logo: { width: '100%', height: '100%' },
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
  },
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
