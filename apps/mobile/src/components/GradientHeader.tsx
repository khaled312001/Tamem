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
  /** Force-hide the back button even when the navigation stack can go back. */
  hideBack?: boolean;
  /** Force-show the bell. Default: shown only if a handler is provided. */
  hasNotifications?: boolean;
  onPressNotifications?: () => void;
}

/**
 * Brand-gradient header used on Home, Map, and any primary stack screen.
 *
 * - On stack screens, a back chevron pointing the natural Arabic-RTL way
 *   (right for "you came from the right") appears automatically. `hideBack`
 *   overrides.
 * - Bell appears only when `onPressNotifications` is provided.
 * - `location` renders under the greeting with a pin icon — used for the
 *   "delivering to: X" affordance on the home screen.
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

  return (
    <LinearGradient
      colors={gradients.brand}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.wrap}
    >
      <View style={styles.row}>
        {showBack ? (
          <Pressable
            onPress={() => {
              if (Platform.OS !== 'web') void Haptics.selectionAsync();
              navigation.goBack();
            }}
            accessibilityLabel="رجوع للصفحة السابقة"
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
            hitSlop={8}
          >
            <BackChevron size={22} color={colors.white} />
          </Pressable>
        ) : null}

        <View style={{ flex: 1, marginHorizontal: showBack || showBell ? spacing.sm : 0 }}>
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

        {showBell ? (
          <Pressable
            onPress={onPressNotifications}
            accessibilityLabel="الإشعارات"
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
            hitSlop={6}
          >
            <Bell size={18} color={colors.white} />
            {hasNotifications && <View style={styles.bellDot} />}
          </Pressable>
        ) : null}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  greeting: {
    color: colors.white,
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.headingBold,
  },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  location: {
    color: colors.white,
    fontSize: fontSizes.xs,
    opacity: 0.92,
    fontFamily: fontFamilies.body,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
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
