import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, shadows, spacing } from '../../theme/tokens';

/**
 * StickyBar — floating bottom action bar with safe-area aware padding and
 * a slide-up entrance. Use for cart total + place-order CTA, accept-price
 * actions, etc.
 *
 *   {visible && (
 *     <StickyBar>
 *       <CartSummary />
 *       <Button label="إتمام الطلب" onPress={...} fullWidth />
 *     </StickyBar>
 *   )}
 */
export interface StickyBarProps {
  children: React.ReactNode;
  visible?: boolean;
  style?: ViewStyle;
}

export function StickyBar({ children, visible = true, style }: StickyBarProps) {
  const insets = useSafeAreaInsets();
  const translate = useRef(new Animated.Value(visible ? 0 : 140)).current;

  useEffect(() => {
    Animated.spring(translate, {
      toValue: visible ? 0 : 140,
      damping: 18,
      stiffness: 220,
      mass: 1,
      useNativeDriver: true,
    }).start();
  }, [visible, translate]);

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.wrap,
        shadows.lg,
        {
          paddingBottom: Math.max(insets.bottom, spacing.md),
          transform: [{ translateY: translate }],
        },
        style,
      ]}
    >
      <View style={styles.inner}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  inner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
