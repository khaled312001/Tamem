/**
 * CurvedTabBar — custom bottom tab bar with a smooth concave notch in the
 * middle. The notch hosts the QuickOrder magic-lamp FAB so the whole footer
 * reads as one professional, sculpted surface instead of a plain rectangle.
 *
 * Layout (RTL — first tab on the right):
 *   [ HomeTab ] [ CartTab ] [ ⊙ FAB ⊙ ] [ Orders ] [ ProfileTab ]
 *
 * The background is a single SVG <Path> so the notch curve is true vector
 * (no rounded corners faking it). The path is recomputed when the screen
 * width changes — supports rotation / split-screen on tablets gracefully.
 */
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { QuickOrderSheet } from './QuickOrderSheet';
import { useEffect, useRef } from 'react';
import { Image } from 'react-native';

import { colors, fontFamilies, fontSizes, shadows } from '../theme/tokens';

const TAB_BAR_HEIGHT = 70;
const NOTCH_RADIUS = 36; // bigger = wider notch arc
const FAB_SIZE = 60; // size of the magic-lamp FAB sitting in the notch
const useNative = Platform.OS !== 'web';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const lampImage = require('../assets/magic-lamp.png');

/* ───── path generator ───── */
function buildPath(width: number): string {
  const cx = width / 2;
  // Two cubic bezier curves: shoulder → bottom of notch → opposite shoulder.
  // Tuning constants picked by eye — they give a soft, slightly squared
  // curve rather than a strict half-circle (matches modern fintech apps).
  const r = NOTCH_RADIUS;
  const shoulder = r * 1.4; // how far the curve reaches sideways
  const depth = r * 1.05; // how deep the dip goes
  const top = 0;

  return [
    `M 0 ${top}`,
    `H ${cx - shoulder}`,
    // Down into the notch
    `C ${cx - shoulder * 0.4} ${top}, ${cx - r * 0.95} ${depth}, ${cx} ${depth}`,
    // Up and out the other side
    `C ${cx + r * 0.95} ${depth}, ${cx + shoulder * 0.4} ${top}, ${cx + shoulder} ${top}`,
    `H ${width}`,
    `V ${TAB_BAR_HEIGHT + 40}`,
    `H 0`,
    `Z`,
  ].join(' ');
}

/* ───── tab item ───── */
interface TabItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  badge?: number;
  onPress: () => void;
  side: 'right' | 'left';
}
function TabItem({ icon, label, active, badge, onPress }: TabItemProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [tabStyles.wrap, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={tabStyles.iconWrap}>
        {icon}
        {badge != null && badge > 0 && (
          <View style={tabStyles.badge}>
            <Text style={tabStyles.badgeText} numberOfLines={1}>
              {badge > 99 ? '99+' : String(badge)}
            </Text>
          </View>
        )}
      </View>
      <Text style={[tabStyles.label, active && tabStyles.labelActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const tabStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  iconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    insetInlineEnd: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.brand.red,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  badgeText: {
    color: colors.white,
    fontFamily: fontFamilies.headingBlack,
    fontSize: 9,
    lineHeight: 11,
    includeFontPadding: false,
  },
  label: {
    marginTop: 2,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.text.muted,
  },
  labelActive: {
    color: colors.brand.red,
  },
});

/* ───── magic-lamp FAB (the one in the notch) ───── */
function NotchFAB({ onPress }: { onPress: () => void }) {
  const bob = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
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
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: useNative,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 1100,
          useNativeDriver: useNative,
        }),
      ]),
    ).start();
  }, [bob, glow]);

  const triggerPress = () => {
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
    setTimeout(onPress, 320);
  };

  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });
  const pressScale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.88] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.95] });
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] });

  return (
    <Animated.View style={[fabStyles.slot, { transform: [{ translateY }, { scale: pressScale }] }]}>
      <Animated.View
        pointerEvents="none"
        style={[fabStyles.glow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]}
      />
      <Pressable
        onPress={triggerPress}
        accessibilityRole="button"
        accessibilityLabel="طلب سريع"
        style={({ pressed }) => [fabStyles.pressable, pressed && { opacity: 0.96 }]}
      >
        <View style={fabStyles.disc}>
          <Image source={lampImage} style={fabStyles.lampImg} resizeMode="contain" />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const FAB_GLOW_PAD = 12;
const fabStyles = StyleSheet.create({
  slot: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    top: -FAB_GLOW_PAD,
    bottom: -FAB_GLOW_PAD,
    insetInlineStart: -FAB_GLOW_PAD,
    insetInlineEnd: -FAB_GLOW_PAD,
    borderRadius: (FAB_SIZE + FAB_GLOW_PAD * 2) / 2,
    backgroundColor: '#F2A93B',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 0 28px 8px rgba(242,169,59,0.6)' }
      : {
          shadowColor: '#F2A93B',
          shadowOpacity: 0.9,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 0 },
        }),
  },
  pressable: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 8px 20px rgba(176, 100, 10, 0.45)' }
      : { elevation: 12 }),
  },
  disc: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: FAB_SIZE / 2,
    borderWidth: 2.5,
    borderColor: '#FFE082',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lampImg: {
    width: '74%',
    height: '74%',
  },
});

/* ───── main custom tab bar ───── */
interface IconProps {
  size: number;
  color: string;
}

interface TabSlot {
  routeKey: string;
  routeName: string;
  label: string;
  active: boolean;
  badge?: number;
  Icon: (p: IconProps) => React.ReactNode;
  onPress: () => void;
}

export interface CurvedTabBarSlotsBuilder {
  (props: BottomTabBarProps): { rightSlots: TabSlot[]; leftSlots: TabSlot[] };
}

interface Props extends BottomTabBarProps {
  slotsBuilder: CurvedTabBarSlotsBuilder;
}

export function CurvedTabBar({ slotsBuilder, ...props }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [fabOpen, setFabOpen] = useState(false);

  const { rightSlots, leftSlots } = slotsBuilder(props);
  const path = buildPath(width);
  const bottomInset = Platform.OS === 'web' ? 8 : Math.max(insets.bottom, 8);
  const TAB_ICON_COLOR_ACTIVE = colors.brand.red;
  const TAB_ICON_COLOR_INACTIVE = colors.text.muted;

  return (
    <View style={[styles.container, { paddingBottom: bottomInset }]}>
      {/* SVG curved background */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <Svg width={width} height={TAB_BAR_HEIGHT + bottomInset + 40}>
          <Path d={path} fill={colors.white} />
        </Svg>
      </View>

      {/* Top accent line — soft gradient highlight at the very top edge */}
      <View pointerEvents="none" style={styles.accentLine} />

      {/* Row: 2 right tabs · FAB · 2 left tabs (RTL source order) */}
      <View style={[styles.row, { height: TAB_BAR_HEIGHT }]}>
        {/* Right side */}
        <View style={styles.sideGroup}>
          {rightSlots.map((s) => (
            <TabItem
              key={s.routeKey}
              icon={s.Icon({
                size: 22,
                color: s.active ? TAB_ICON_COLOR_ACTIVE : TAB_ICON_COLOR_INACTIVE,
              })}
              label={s.label}
              active={s.active}
              badge={s.badge}
              onPress={s.onPress}
              side="right"
            />
          ))}
        </View>

        {/* Center FAB notch — same width as the SVG notch shoulder */}
        <View style={styles.notchSlot}>
          <NotchFAB onPress={() => setFabOpen(true)} />
        </View>

        {/* Left side */}
        <View style={styles.sideGroup}>
          {leftSlots.map((s) => (
            <TabItem
              key={s.routeKey}
              icon={s.Icon({
                size: 22,
                color: s.active ? TAB_ICON_COLOR_ACTIVE : TAB_ICON_COLOR_INACTIVE,
              })}
              label={s.label}
              active={s.active}
              badge={s.badge}
              onPress={s.onPress}
              side="left"
            />
          ))}
        </View>
      </View>

      <Modal
        visible={fabOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFabOpen(false)}
      >
        <QuickOrderSheet visible={fabOpen} onClose={() => setFabOpen(false)} />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    insetInlineStart: 0,
    insetInlineEnd: 0,
    bottom: 0,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 -10px 24px -10px rgba(0,0,0,0.18)' }
      : { ...shadows.md, shadowOffset: { width: 0, height: -6 }, elevation: 16 }),
  },
  accentLine: {
    position: 'absolute',
    top: 0,
    insetInlineStart: '15%',
    insetInlineEnd: '15%',
    height: 3,
    borderRadius: 99,
    backgroundColor: 'rgba(242,169,59,0.35)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  sideGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-around',
  },
  notchSlot: {
    width: FAB_SIZE + 24,
    height: TAB_BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 4,
  },
});
