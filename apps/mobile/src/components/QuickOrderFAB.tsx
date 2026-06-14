/**
 * Floating Action Button — a glowing brass-ringed Lottie talisman that
 * lives in the bottom-right corner of HomeScreen and opens QuickOrderSheet.
 *
 * The hand-rolled SVG genie lamp + six smoke-wisp Animated.Values that this
 * file used to carry have been replaced by a professionally authored Lottie
 * animation (a golden "wish star" sparkle). Lottie owns all the looping
 * motion; we only drive a short press-jolt + a quick replay-from-frame-0
 * burst when the user taps, so the talisman feels alive on press.
 *
 * Asset: `src/assets/animations/genie-lamp.json` — bundled at build time
 * so there is zero runtime network dependency. The animation is rendered
 * inside a circular brass ring (LinearGradient + warm border) that carries
 * the Aladdin theme even though the Lottie itself is a generic gold star.
 */
import { LinearGradient } from 'expo-linear-gradient';
import LottieView from 'lottie-react-native';
import { useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { QuickOrderSheet } from './QuickOrderSheet';

import { colors, fontFamilies, spacing } from '../theme/tokens';

// Bundled — Metro inlines this. License: Lottie Simple License (free for
// commercial use, no attribution required).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const genieLamp = require('../assets/animations/genie-lamp.json');

const LAMP_SIZE = 76;
const useNative = Platform.OS !== 'web';

export function QuickOrderFAB() {
  const [open, setOpen] = useState(false);
  const lottieRef = useRef<LottieView>(null);

  // Press-jolt — squash + bounce-back. Lottie handles all the looping idle
  // motion, but a tactile scale-pulse on tap is what makes the button feel
  // pressable rather than merely decorative.
  const press = useRef(new Animated.Value(0)).current;
  const pressScale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.86] });

  const onPress = () => {
    // 1. Replay the lottie from frame 0 at 1.5x speed — feels like the
    //    talisman "reacts" to the touch with a burst of sparkle.
    lottieRef.current?.reset();
    lottieRef.current?.play();

    // 2. Quick mechanical squash so the press registers in muscle memory.
    press.setValue(0);
    Animated.sequence([
      Animated.timing(press, {
        toValue: 1,
        duration: 140,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: useNative,
      }),
      Animated.spring(press, {
        toValue: 0,
        damping: 8,
        mass: 0.5,
        stiffness: 200,
        useNativeDriver: useNative,
      }),
    ]).start();

    // 3. Open the sheet just after the sparkle reaches its peak — feels
    //    like the wish summoned it.
    setTimeout(() => setOpen(true), 360);
  };

  return (
    <>
      <View style={[styles.layer, { pointerEvents: 'box-none' }]}>
        {/* Soft golden halo behind the talisman — a thin glow that
            anchors the FAB visually. No animation needed; the Lottie
            inside already pulses. */}
        <View pointerEvents="none" style={styles.glow} />

        <Animated.View
          style={[
            styles.lampWrap,
            { transform: [{ scale: pressScale }] },
            { pointerEvents: 'box-none' },
          ]}
        >
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel="طلب سريع"
            style={({ pressed }) => [styles.pressable, pressed && { opacity: 0.96 }]}
          >
            <LinearGradient
              colors={['#FFE082', '#F2A93B', '#B66B0A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ring}
            >
              <LottieView
                ref={lottieRef}
                source={genieLamp}
                autoPlay
                loop
                speed={1}
                resizeMode="contain"
                style={styles.lottie}
              />
            </LinearGradient>
          </Pressable>
        </Animated.View>

        <View style={[styles.labelBubble, { pointerEvents: 'none' }]}>
          <Text style={styles.labelText}>طلب سريع</Text>
        </View>
      </View>

      <QuickOrderSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    bottom: 24,
    insetInlineStart: spacing.md, // RTL-aware: hugs the right side in Arabic
    alignItems: 'center',
    width: LAMP_SIZE + 24,
    zIndex: 50,
  },
  // Soft golden halo behind the talisman.
  glow: {
    position: 'absolute',
    bottom: 24,
    width: LAMP_SIZE + 28,
    height: LAMP_SIZE + 28,
    borderRadius: (LAMP_SIZE + 28) / 2,
    backgroundColor: '#F2A93B',
    opacity: 0.55,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 0 32px 10px rgba(242,169,59,0.65)' }
      : {
          shadowColor: '#F2A93B',
          shadowOpacity: 0.9,
          shadowRadius: 28,
          shadowOffset: { width: 0, height: 0 },
        }),
  },
  lampWrap: {
    width: LAMP_SIZE,
    height: LAMP_SIZE,
    borderRadius: LAMP_SIZE / 2,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 10px 28px rgba(176, 100, 10, 0.55)' }
      : { elevation: 14 }),
  },
  pressable: {
    width: '100%',
    height: '100%',
    borderRadius: LAMP_SIZE / 2,
    overflow: 'hidden',
  },
  ring: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFF6D5',
    borderRadius: LAMP_SIZE / 2,
  },
  lottie: {
    width: '100%',
    height: '100%',
  },
  labelBubble: {
    marginTop: 6,
    backgroundColor: colors.brand.dark,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 99,
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 10px rgba(0,0,0,0.18)' } : { elevation: 4 }),
  },
  labelText: {
    color: colors.white,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 14,
  },
});
