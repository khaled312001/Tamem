/**
 * Floating Action Button — a glowing magic lamp that lives in the bottom-
 * right corner of HomeScreen and opens QuickOrderSheet on press.
 *
 * The lamp itself is a hand-illustrated PNG (`assets/magic-lamp.png`)
 * floating on a soft white disc with a warm golden halo behind it. The
 * halo is centered around the lamp circle so the FAB reads as a single,
 * round object — no off-axis offset.
 *
 * Motion: a slow up-and-down bob keeps the lamp alive; a press-jolt
 * (squash + spring back) gives tactile feedback, and the QuickOrderSheet
 * opens just as the bounce finishes so it feels like the wish summoned it.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { QuickOrderSheet } from './QuickOrderSheet';

import { colors, fontFamilies, spacing } from '../theme/tokens';

const LAMP_SIZE = 76;
const GLOW_PAD = 18; // halo extends this far past the lamp on every side
const useNative = Platform.OS !== 'web';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const lampImage = require('../assets/magic-lamp.png');

export function QuickOrderFAB() {
  const [open, setOpen] = useState(false);

  // Slow idle bob — ~5px up/down on a 1.6s loop. Native driver where
  // supported so the bob is buttery and doesn't fight other work.
  const bob = useRef(new Animated.Value(0)).current;
  // Press squash — 0..1 .. springs back to 0.
  const press = useRef(new Animated.Value(0)).current;
  // Subtle halo pulse so the FAB never feels static.
  const glow = useRef(new Animated.Value(0)).current;
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (openTimer.current) clearTimeout(openTimer.current);
    },
    [],
  );

  useEffect(() => {
    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: useNative,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: useNative,
        }),
      ]),
    );
    bobLoop.start();

    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: useNative,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: useNative,
        }),
      ]),
    );
    glowLoop.start();

    // Without this the two loops keep driving frames after unmount, forever.
    return () => {
      bobLoop.stop();
      glowLoop.stop();
    };
  }, [bob, glow]);

  const onPress = () => {
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
        damping: 7,
        mass: 0.5,
        stiffness: 200,
        useNativeDriver: useNative,
      }),
    ]).start();

    // Tracked so navigating away mid-bounce can't setState on a dead tree.
    openTimer.current = setTimeout(() => setOpen(true), 320);
  };

  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });
  const pressScale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.86] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.85] });
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });

  return (
    <>
      <View style={[styles.layer, { pointerEvents: 'box-none' }]}>
        {/* Lamp + halo container — both share the same center so the glow
            sits perfectly behind the lamp instead of leaking to one side. */}
        <Animated.View
          style={[
            styles.lampSlot,
            { transform: [{ translateY }, { scale: pressScale }] },
            { pointerEvents: 'box-none' },
          ]}
        >
          {/* Glow halo — absolute, inset negative so it extends past the
              lamp by GLOW_PAD on every side, centered on the same point. */}
          <Animated.View
            pointerEvents="none"
            style={[styles.glow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]}
          />

          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel="طلب سريع"
            style={({ pressed }) => [styles.pressable, pressed && { opacity: 0.96 }]}
          >
            <View style={styles.disc}>
              <Image source={lampImage} style={styles.lampImg} resizeMode="contain" />
            </View>
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
    insetInlineStart: spacing.md, // RTL: hugs the right side in Arabic
    alignItems: 'center',
    width: LAMP_SIZE + GLOW_PAD * 2,
    zIndex: 50,
  },
  // The slot houses both the halo and the lamp disc, both centered.
  lampSlot: {
    width: LAMP_SIZE,
    height: LAMP_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Halo extends past the lamp by GLOW_PAD on every side, perfectly centered.
  glow: {
    position: 'absolute',
    top: -GLOW_PAD,
    bottom: -GLOW_PAD,
    insetInlineStart: -GLOW_PAD,
    insetInlineEnd: -GLOW_PAD,
    borderRadius: (LAMP_SIZE + GLOW_PAD * 2) / 2,
    backgroundColor: '#F2A93B',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 0 36px 12px rgba(242,169,59,0.55)' }
      : {
          shadowColor: '#F2A93B',
          shadowOpacity: 0.9,
          shadowRadius: 32,
          shadowOffset: { width: 0, height: 0 },
        }),
  },
  pressable: {
    width: LAMP_SIZE,
    height: LAMP_SIZE,
    borderRadius: LAMP_SIZE / 2,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 10px 24px rgba(176, 100, 10, 0.5)' }
      : { elevation: 14 }),
  },
  // White disc behind the lamp PNG — makes the gold lamp pop against any
  // page background.
  disc: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: LAMP_SIZE / 2,
    borderWidth: 3,
    borderColor: '#FFE082',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lampImg: {
    width: '70%',
    height: '70%',
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
