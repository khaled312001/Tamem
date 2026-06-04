import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { X } from 'lucide-react-native';

import { colors, radii, shadows, spacing, typography, zIndex } from '../../theme/tokens';

/**
 * BottomSheet — modal sheet that slides up from the bottom. Replaces
 * Alert.alert + ad-hoc Modals for forms, pickers, confirmations.
 *
 * - Tap backdrop or drag handle → onClose
 * - Body is a ScrollView by default so long pickers don't overflow
 * - Title row is sticky at the top
 *
 *   <BottomSheet visible={open} title="عناوين محفوظة" onClose={...}>
 *     <AddressList />
 *   </BottomSheet>
 */
export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  /** Suppress the body ScrollView wrapper — children handle their own scrolling. */
  unscrollable?: boolean;
  /** Max height as a fraction of screen height (default 0.85). */
  maxHeightFraction?: number;
  /** Optional sticky footer (e.g. primary action button). */
  footer?: ReactNode;
  style?: ViewStyle;
}

const { height: SCREEN_H } = Dimensions.get('window');

export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  unscrollable,
  maxHeightFraction = 0.85,
  footer,
  style,
}: BottomSheetProps) {
  const translateY = useRef(new Animated.Value(SCREEN_H)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          damping: 18,
          stiffness: 220,
          mass: 1,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: SCREEN_H,
          duration: 220,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, opacity, translateY]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View style={[styles.backdrop, { opacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="إغلاق" />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          shadows.xl,
          { maxHeight: SCREEN_H * maxHeightFraction, transform: [{ translateY }] },
          style,
        ]}
      >
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        {title && (
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.h3, { color: colors.ink }]} numberOfLines={1}>
                {title}
              </Text>
              {subtitle && (
                <Text
                  style={[typography.caption, { color: colors.text.muted, marginTop: 2 }]}
                  numberOfLines={2}
                >
                  {subtitle}
                </Text>
              )}
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.closeBtn}
              accessibilityLabel="إغلاق"
            >
              <X size={20} color={colors.text.secondary} />
            </Pressable>
          </View>
        )}

        {unscrollable ? (
          <View style={styles.body}>{children}</View>
        ) : (
          <ScrollView
            style={styles.body}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: spacing.lg }}
          >
            {children}
          </ScrollView>
        )}

        {footer && <View style={styles.footer}>{footer}</View>}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.alpha.black60,
    zIndex: zIndex.sheet,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingBottom: spacing.xl,
    zIndex: zIndex.sheet + 1,
  },
  handleRow: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handle: { width: 44, height: 4, borderRadius: 2, backgroundColor: colors.line2 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
});
