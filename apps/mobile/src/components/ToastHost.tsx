import { CheckCircle2, Info, X, XCircle } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { dismissToast, subscribeToast, type ToastRecord, type ToastTone } from '../lib/toast';
import { colors, fontFamilies, fontSizes, radii, shadows, spacing } from '../theme/tokens';

const TONES: Record<ToastTone, { bg: string; border: string; fg: string; Icon: LucideIcon }> = {
  success: {
    bg: colors.successLight,
    border: colors.success,
    fg: colors.success,
    Icon: CheckCircle2,
  },
  error: { bg: colors.dangerLight, border: colors.danger, fg: colors.danger, Icon: XCircle },
  info: { bg: colors.infoLight, border: colors.info, fg: colors.info, Icon: Info },
};

/**
 * Mount once near the navigation root. Renders the active toast (if any) at
 * the top of the screen, sliding down from above with a small bounce.
 */
export function ToastHost() {
  const [toast, setToast] = useState<ToastRecord | null>(null);
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => subscribeToast(setToast), []);

  useEffect(() => {
    if (toast) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: Platform.OS !== 'web',
          damping: 18,
          stiffness: 160,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: Platform.OS !== 'web',
          easing: Easing.out(Easing.cubic),
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -120,
          duration: 200,
          useNativeDriver: Platform.OS !== 'web',
          easing: Easing.in(Easing.cubic),
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start();
    }
  }, [toast, translateY, opacity]);

  if (!toast) return null;

  const tone = TONES[toast.tone];

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.host, { top: insets.top + spacing.sm, transform: [{ translateY }], opacity }]}
    >
      <Pressable
        onPress={dismissToast}
        style={[styles.toast, shadows.md, { backgroundColor: tone.bg, borderColor: tone.border }]}
      >
        <View style={[styles.iconWrap, { backgroundColor: colors.white }]}>
          <tone.Icon size={18} color={tone.fg} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: tone.fg }]} numberOfLines={1}>
            {toast.title}
          </Text>
          {toast.message ? (
            <Text style={[styles.message, { color: tone.fg }]} numberOfLines={2}>
              {toast.message}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={dismissToast}
          style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
          hitSlop={6}
        >
          <X size={14} color={tone.fg} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 9999,
    elevation: 9999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.sm,
  },
  message: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    marginTop: 2,
    lineHeight: 18,
    opacity: 0.92,
  },
  closeBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
