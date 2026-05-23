import { LinearGradient } from 'expo-linear-gradient';
import { Bell, MapPin } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, fontSizes, gradients, radii, spacing } from '../theme/tokens';

interface GradientHeaderProps {
  greeting: string;
  location?: string;
  hasNotifications?: boolean;
  onPressNotifications?: () => void;
}

/**
 * Top brand-gradient header used on Home and Map screens.
 * Mirrors the `.ah.grad` block from design-tamem.html.
 */
export function GradientHeader({
  greeting,
  location,
  hasNotifications,
  onPressNotifications,
}: GradientHeaderProps) {
  return (
    <LinearGradient
      colors={gradients.brand}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.wrap}
    >
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{greeting}</Text>
          {location && (
            <View style={styles.locRow}>
              <MapPin size={11} color={colors.white} />
              <Text style={styles.location}>{location}</Text>
            </View>
          )}
        </View>
        <Pressable onPress={onPressNotifications} style={styles.bellBtn}>
          <Bell size={18} color={colors.white} />
          {hasNotifications && <View style={styles.bellDot} />}
        </Pressable>
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
  bellBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  bellDot: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.brand.gold,
  },
});
