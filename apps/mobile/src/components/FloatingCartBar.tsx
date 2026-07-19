/**
 * FloatingCartBar — slim sticky strip that docks right above the tab bar
 * when the cart has items.
 *
 * Design: full-width strip flush with the tabs, only the TOP corners
 * rounded so it visually merges with the footer instead of looking like
 * a separate floating chip. Same UX as Talabat/Mrsool's docked basket.
 *
 * Tap → navigates to the Cart screen.
 */
import { useNavigationState } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { ShoppingCart } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { MoneyText } from './ui';
import { navigationRef } from '../lib/push';
import { useCart } from '../stores/cart';
import { colors, fontFamilies, fontSizes, gradients, radii, spacing } from '../theme/tokens';

// Routes where the docked cart strip should NOT appear because the
// screen itself owns the bottom CTA (would otherwise be obscured).
// Matched against the deepest active route name in the nav tree.
const HIDE_ON_ROUTES = new Set(['ProductDetail', 'Cart', 'CartCheckout', 'DynamicServiceFlow']);

/** Walk the nav state down to the deepest currently-active route name. */
function getActiveRouteName(
  state: ReturnType<typeof useNavigationState> | undefined,
): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let s: any = state;
  while (s?.routes && s.index != null) {
    const route = s.routes[s.index];
    if (!route?.state) return route?.name ?? null;
    s = route.state;
  }
  return null;
}

// Height of the docked strip — exported so AppTabs can position it
// flush against the top of the tab bar.
export const FLOATING_CART_HEIGHT = 48;

interface Props {
  /** Distance from the bottom of the screen to dock against (tab bar height). */
  bottomOffset?: number;
}

export function FloatingCartBar({ bottomOffset = 0 }: Props) {
  const cart = useCart();
  const activeRoute = useNavigationState(getActiveRouteName);
  const shouldHide = activeRoute ? HIDE_ON_ROUTES.has(activeRoute) : false;
  const visible = cart.count > 0 && !shouldHide;
  const translateY = useRef(new Animated.Value(FLOATING_CART_HEIGHT + 20)).current;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: visible ? 0 : FLOATING_CART_HEIGHT + 20,
      damping: 18,
      stiffness: 220,
      mass: 1,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [visible, translateY]);

  if (cart.count === 0 || shouldHide) return null;

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.wrap, { bottom: bottomOffset, transform: [{ translateY }] }]}
    >
      <Pressable
        onPress={() => {
          // Drill from the NavigationContainer root: App → HomeTab → Cart.
          // We use navigationRef instead of useNavigation() because the bar
          // sits inside AppTabs but outside Tabs.Navigator — the local
          // navigation prop unwraps the 'App' layer and the dispatch ends
          // up addressed to the Root Stack (which has no HomeTab).
          if (!navigationRef.isReady()) return;
          navigationRef.navigate('App', {
            screen: 'HomeTab',
            params: { screen: 'Cart' },
          });
        }}
        style={({ pressed }) => [pressed && { opacity: 0.94 }]}
        accessibilityRole="button"
        accessibilityLabel={`فتح السلة، ${cart.count} منتج`}
      >
        <LinearGradient
          colors={gradients.brand as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.bar}
        >
          {/* Left: cart icon with count badge */}
          <View style={styles.iconWrap}>
            <ShoppingCart size={16} color={colors.white} />
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{cart.count > 99 ? '99+' : cart.count}</Text>
            </View>
          </View>

          {/* Middle: label + merchant count */}
          <View style={styles.middle}>
            <Text style={styles.label}>عرض السلة</Text>
            <Text style={styles.merchant} numberOfLines={1}>
              {cart.merchantIds.length > 1
                ? `${cart.merchantIds.length} تجار`
                : (cart.items[0]?.merchantNameAr ?? '')}
            </Text>
          </View>

          {/* Right: total */}
          <View style={styles.totalWrap}>
            <MoneyText amount={cart.subtotal} tone="inverse" size="sm" showCurrency />
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    // left/right, not insetInline*: pinning BOTH logical sides did not
    // stretch the element on this RN version — it collapsed to its content
    // width and drifted to one edge. A full-bleed bar is symmetric, so the
    // physical props are also RTL-safe here.
    left: 0,
    right: 0,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: FLOATING_CART_HEIGHT,
    paddingHorizontal: spacing.md,
    // Only top corners — strip merges with the tab bar visually
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -5,
    insetInlineEnd: -5,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.brand.gold,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.brand.red,
  },
  badgeText: {
    color: colors.brand.dark,
    fontFamily: fontFamilies.headingBlack,
    fontSize: 10,
    lineHeight: 12,
    includeFontPadding: false,
  },
  middle: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  label: {
    color: colors.white,
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.sm,
  },
  merchant: {
    color: 'rgba(255,255,255,0.82)',
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    flexShrink: 1,
  },
  totalWrap: {
    backgroundColor: 'rgba(0,0,0,0.20)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
});
