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
 * The app is RTL-only, so we position the back button physically on the RIGHT
 * with `right: X` and the action button physically on the LEFT with `left: X`.
 * Using `start`/`end` is unreliable on RN-Web and was leaving the back button
 * on the wrong side. Plain left/right + a high zIndex keeps the buttons
 * clickable above the centered title block.
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
      <View style={[styles.center, { paddingRight: sidePad, paddingLeft: sidePad }]}>
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

      {/* Buttons rendered LAST so they sit on top of the title and stay
          clickable. Positioned with literal left/right because the app is
          RTL-only: back = physical right, action = physical left. */}
      {showBack ? (
        <Pressable
          onPress={() => {
            if (Platform.OS !== 'web') void Haptics.selectionAsync();
            navigation.goBack();
          }}
          accessibilityLabel="رجوع للصفحة السابقة"
          style={({ pressed }) => [
            styles.iconBtn,
            styles.iconBtnRight,
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
          style={({ pressed }) => [styles.iconBtn, styles.iconBtnLeft, pressed && { opacity: 0.7 }]}
          hitSlop={6}
        >
          <Bell size={18} color={colors.white} />
          {hasNotifications && <View style={styles.bellDot} />}
        </Pressable>
      ) : null}
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
    // The header writes Arabic, so titles read from the right edge.
    alignItems: 'flex-start',
  },
  greeting: {
    color: colors.white,
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.headingBold,
  },
  locRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  location: {
    color: colors.white,
    fontSize: fontSizes.xs,
    opacity: 0.92,
    fontFamily: fontFamilies.body,
  },
  iconBtn: {
    position: 'absolute',
    top: spacing.lg,
    zIndex: 10,
    elevation: 10,
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnRight: { right: spacing.lg },
  iconBtnLeft: { left: spacing.lg },
  bellDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.brand.gold,
  },
});
