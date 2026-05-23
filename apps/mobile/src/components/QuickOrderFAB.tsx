import { LinearGradient } from 'expo-linear-gradient';
import { Plus } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';

import { QuickOrderSheet } from './QuickOrderSheet';

import { colors, gradients, spacing } from '../theme/tokens';

const spacingMd = spacing.md;

/**
 * Floating Action Button — visible on every screen (HomeStack root level).
 * Tap → opens QuickOrderSheet with 3 instant-order modes (text / photo / voice).
 */
export function QuickOrderFAB() {
  const [open, setOpen] = useState(false);
  const rotate = useRef(new Animated.Value(0)).current;
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

  useEffect(() => {
    Animated.timing(rotate, {
      toValue: open ? 1 : 0,
      duration: 220,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [open, rotate]);

  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  return (
    <>
      <View pointerEvents="box-none" style={styles.layer}>
        <Animated.View
          style={[styles.fabWrap, { transform: [{ scale: pulse }] }]}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={() => setOpen((p) => !p)}
            style={({ pressed }) => [
              styles.fabPressable,
              pressed && { transform: [{ scale: 0.95 }] },
            ]}
            accessibilityLabel="فتح الطلب السريع"
          >
            <LinearGradient
              colors={gradients.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.fabInner}
            >
              <Animated.View style={{ transform: [{ rotate: spin }] }}>
                <Plus size={28} color={colors.white} strokeWidth={2.5} />
              </Animated.View>
            </LinearGradient>
          </Pressable>
        </Animated.View>
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
    borderRadius: 32,
    overflow: 'hidden',
  },
  fabInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.white,
    borderRadius: 32,
  },
});
