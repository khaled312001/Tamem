import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Bell, MapPin } from 'lucide-react-native';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { BackChevron } from '../theme/rtl';
import { colors, fontFamilies, fontSizes, gradients, radii, spacing } from '../theme/tokens';

interface GradientHeaderProps {
  greeting: string;
  location?: string;
  hideBack?: boolean;
  hasNotifications?: boolean;
  onPressNotifications?: () => void;
}

/**
 * Brand-gradient header for primary screens.
 *
 * RTL: back button is absolutely positioned to the START side (right in
 * Arabic) regardless of platform. RN-Web doesn't always honor forceRTL for
 * flexDirection, so we anchor with `start`/`end` to guarantee the layout
 * matches what an Arabic user expects: title centered/right, back-right,
 * actions-left.
 */
export function GradientHeader({
  greeting,
  location,
  hideBack,
  hasNotifications,
  onPressNotifications,
}: GradientHeaderProps) {
  const navigation = useNavigation();
  const showBack = !hideBack && navigation.canGoBack();
  const showBell = onPressNotifications !== undefined;

  const sidePad = showBack || showBell ? 60 : spacing.lg;

  return (
    <LinearGradient
      colors={gradients.brand}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.wrap}
    >
      {showBack ? (
        <Pressable
          onPress={() => {
            if (Platform.OS !== 'web') void Haptics.selectionAsync();
            navigation.goBack();
          }}
          accessibilityLabel="رجوع للصفحة السابقة"
          style={({ pressed }) => [
            styles.iconBtn,
            styles.iconBtnStart,
            pressed && { opacity: 0.7 },
          ]}
          hitSlop={8}
        >
          <BackChevron size={22} color={colors.white} />
        </Pressable>
      ) : null}

      {showBell ? (
        <Pressable
          onPress={onPressNotifications}
          accessibilityLabel="الإشعارات"
          style={({ pressed }) => [styles.iconBtn, styles.iconBtnEnd, pressed && { opacity: 0.7 }]}
          hitSlop={6}
        >
          <Bell size={18} color={colors.white} />
          {hasNotifications && <View style={styles.bellDot} />}
        </Pressable>
      ) : null}

      <View style={[styles.center, { paddingStart: sidePad, paddingEnd: sidePad }]}>
        <Text style={styles.greeting} numberOfLines={1}>
          {greeting}
        </Text>
        {location ? (
          <View style={styles.locRow}>
            <MapPin size={11} color={colors.white} />
            <Text style={styles.location} numberOfLines={1}>
              {location}
            </Text>
          </View>
        ) : null}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
    position: 'relative',
  },
  center: {
    alignItems: 'flex-end', // RTL natural — title right-aligned
  },
  greeting: {
    color: colors.white,
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.headingBold,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  locRow: {
    flexDirection: 'row-reverse', // pin icon on RIGHT next to text in RTL
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  location: {
    color: colors.white,
    fontSize: fontSizes.xs,
    opacity: 0.92,
    fontFamily: fontFamilies.body,
    textAlign: 'right',
  },
  iconBtn: {
    position: 'absolute',
    top: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnStart: { start: spacing.lg },
  iconBtnEnd: { end: spacing.lg },
  bellDot: {
    position: 'absolute',
    top: 8,
    end: 9,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.brand.gold,
  },
});
