import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, fontSizes, gradients, radii, spacing } from '../theme/tokens';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  hideBack?: boolean;
}

/**
 * Branded header strip with a back button — used inside nested stacks
 * (Profile sub-screens, flow screens) where GradientHeader's greeting
 * style doesn't fit.
 */
export function ScreenHeader({ title, subtitle, hideBack }: ScreenHeaderProps) {
  const navigation = useNavigation();
  const canGoBack = !hideBack && navigation.canGoBack();

  return (
    <LinearGradient
      colors={gradients.brand}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.wrap}
    >
      <View style={styles.row}>
        {canGoBack ? (
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.back, pressed && { opacity: 0.7 }]}
            accessibilityLabel="رجوع"
          >
            <ChevronRight size={22} color={colors.white} />
          </Pressable>
        ) : (
          <View style={styles.back} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        <View style={styles.back} />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  back: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.white,
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.headingBold,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.white,
    opacity: 0.85,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.body,
    textAlign: 'center',
    marginTop: 2,
  },
});
