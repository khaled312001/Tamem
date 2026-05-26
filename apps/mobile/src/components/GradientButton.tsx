import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
} from 'react-native';

import { colors, fontFamilies, fontSizes, gradients, radii, spacing } from '../theme/tokens';

interface GradientButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'brand' | 'gold' | 'outline';
  style?: ViewStyle;
  /** Set to false to disable the medium-impact haptic feedback. Default true. */
  haptic?: boolean;
}

function tap(haptic: boolean | undefined) {
  if (haptic === false) return;
  if (Platform.OS === 'web') return;
  // ImpactFeedbackStyle.Medium feels best for primary CTAs.
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {
    // ignore — some Android devices ship without the haptic motor.
  });
}

/**
 * Brand-gradient button matching design-tamem.html `.pbtn` pattern.
 * `outline` renders as white background with red border + text.
 */
export function GradientButton({
  label,
  onPress,
  loading,
  disabled,
  variant = 'brand',
  style,
  haptic,
}: GradientButtonProps) {
  const isDisabled = disabled || loading;
  const handlePress = () => {
    if (!isDisabled) {
      tap(haptic);
      onPress();
    }
  };

  if (variant === 'outline') {
    return (
      <Pressable
        onPress={handlePress}
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.outline,
          pressed && styles.pressed,
          isDisabled && styles.disabled,
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={colors.brand.red} />
        ) : (
          <Text style={[styles.text, { color: colors.brand.red }]}>{label}</Text>
        )}
      </Pressable>
    );
  }

  const grad = variant === 'gold' ? gradients.brandGold : gradients.brand;
  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.shadow,
        pressed && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btn}>
        {loading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.text}>{label}</Text>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shadow: {
    borderRadius: radii.lg,
    boxShadow: '0 6px 12px rgba(224,48,30,0.25)',
    elevation: 5,
  },
  btn: {
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  outline: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.brand.red,
    minHeight: 50,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  text: {
    color: colors.white,
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.md,
  },
});
