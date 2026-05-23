import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { colors, fontFamilies, fontSizes, gradients, radii, spacing } from '../theme/tokens';

interface GradientButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'brand' | 'gold' | 'outline';
  style?: ViewStyle;
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
}: GradientButtonProps) {
  const isDisabled = disabled || loading;

  if (variant === 'outline') {
    return (
      <Pressable
        onPress={onPress}
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
      onPress={onPress}
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
    shadowColor: colors.brand.red,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
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
