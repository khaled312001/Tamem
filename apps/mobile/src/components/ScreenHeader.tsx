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
  rightIcon?: LucideIcon;
  onPressRight?: () => void;
  rightLabel?: string;
  rightContent?: ReactNode;
}

/**
 * Stack header. The app is RTL-only, so the back button is anchored on the
 * physical RIGHT edge (`right: X`) and optional action lives on the LEFT
 * (`left: X`). High zIndex keeps them clickable above the centered title.
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
  const showAction = !!rightContent || !!RightIcon;
  // Mirror the side padding so the title stays optically centered no matter
  // which button is shown.
  const sidePad = canGoBack || showAction ? 60 : spacing.lg;

  return (
    <LinearGradient
      colors={gradients.brand}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.wrap}
    >
      <View style={[styles.center, { paddingHorizontal: sidePad }]}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {canGoBack ? (
        <Pressable
          onPress={() => {
            if (Platform.OS !== 'web') void Haptics.selectionAsync();
            navigation.goBack();
          }}
          style={({ pressed }) => [
            styles.iconBtn,
            styles.iconBtnRight,
            pressed && { opacity: 0.7 },
          ]}
          accessibilityLabel="رجوع"
          hitSlop={8}
        >
          <BackChevron size={22} color={colors.white} />
        </Pressable>
      ) : null}

      {rightContent ? (
        <View style={[styles.iconBtn, styles.iconBtnLeft, { backgroundColor: 'transparent' }]}>
          {rightContent}
        </View>
      ) : RightIcon ? (
        <Pressable
          onPress={onPressRight}
          style={({ pressed }) => [styles.iconBtn, styles.iconBtnLeft, pressed && { opacity: 0.7 }]}
          accessibilityLabel={rightLabel ?? 'إجراء'}
          hitSlop={8}
        >
          <RightIcon size={20} color={colors.white} />
        </Pressable>
      ) : null}
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
    position: 'relative',
  },
  center: {
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center',
  },
  iconBtn: {
    position: 'absolute',
    top: spacing.md,
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
