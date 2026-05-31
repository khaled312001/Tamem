import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { BackChevron } from '../theme/rtl';
import { colors, fontFamilies, fontSizes, gradients, radii, spacing } from '../theme/tokens';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  hideBack?: boolean;
  /** Optional right-side icon button (e.g. share, settings). */
  rightIcon?: LucideIcon;
  onPressRight?: () => void;
  rightLabel?: string;
  /** When set, renders a non-button node on the right side (e.g. cart badge). */
  rightContent?: ReactNode;
}

/**
 * Branded header strip with a back chevron — used inside nested stacks
 * where the rich GradientHeader's "greeting/location" layout doesn't fit.
 *
 * RTL: leading edge (right in Arabic) shows the back chevron pointing right,
 * matching the user's natural sense of "I came from the right, so back is right."
 */
export function ScreenHeader({
  title,
  subtitle,
  hideBack,
  rightIcon: RightIcon,
  onPressRight,
  rightLabel,
  rightContent,
}: ScreenHeaderProps) {
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
            onPress={() => {
              if (Platform.OS !== 'web') void Haptics.selectionAsync();
              navigation.goBack();
            }}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel="رجوع"
            hitSlop={8}
          >
            <BackChevron size={22} color={colors.white} />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {rightContent ??
          (RightIcon ? (
            <Pressable
              onPress={onPressRight}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
              accessibilityLabel={rightLabel ?? 'إجراء'}
              hitSlop={8}
            >
              <RightIcon size={20} color={colors.white} />
            </Pressable>
          ) : (
            <View style={styles.iconBtn} />
          ))}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: radii.lg,
    borderBottomRightRadius: radii.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconBtn: {
    width: 40,
    height: 40,
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
