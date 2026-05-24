import { LinearGradient } from 'expo-linear-gradient';
import { Zap } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { QuickOrderSheet } from './QuickOrderSheet';

import { colors, fontFamilies, gradients, spacing } from '../theme/tokens';

const spacingMd = spacing.md;

/**
 * Floating Action Button — circular lightning icon with "طلب سريع" label
 * underneath. Lives inside HomeScreen only.
 */
export function QuickOrderFAB() {
  const [open, setOpen] = useState(false);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Gentle pulse to draw attention to the FAB
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.08,
          duration: 1200,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    ).start();
  }, [pulse]);

  return (
    <>
      <View pointerEvents="box-none" style={styles.layer}>
        <Animated.View
          style={[styles.fabWrap, { transform: [{ scale: pulse }] }]}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={() => setOpen(true)}
            style={({ pressed }) => [
              styles.fabPressable,
              pressed && { transform: [{ scale: 0.95 }] },
            ]}
            accessibilityLabel="طلب سريع"
          >
            <LinearGradient
              colors={gradients.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.fabInner}
            >
              <Zap size={28} color={colors.white} strokeWidth={2.5} fill={colors.white} />
            </LinearGradient>
          </Pressable>
        </Animated.View>

        <View style={styles.labelBubble} pointerEvents="none">
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
    insetInlineStart: spacingMd, // RTL-aware: hugs the right side in Arabic
    alignItems: 'center',
    zIndex: 50,
  },
  fabWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 8px 24px rgba(224,48,30,0.45)' }
      : { elevation: 12 }),
  },
  fabPressable: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
    overflow: 'hidden',
  },
  fabInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.white,
    borderRadius: 30,
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
