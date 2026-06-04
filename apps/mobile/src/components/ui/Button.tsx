import type { LucideIcon } from 'lucide-react-native';
import { useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import {
  colors,
  gradients,
  hitSlop,
  radii,
  shadows,
  sizes,
  spacing,
  typography,
} from '../../theme/tokens';

/**
 * Variants are intent-driven, not color-driven, so renaming the brand color
 * doesn't require touching every Button call-site.
 *
 *   primary    — main CTA, brand gradient, biggest visual weight
 *   secondary  — supporting action on the same screen, white fill + border
 *   ghost      — tertiary/text-only, used inside cards or rows
 *   danger     — destructive (delete account, cancel order)
 *   success    — confirm-positive, used sparingly
 *   gold       — accent CTAs (rewards, premium)
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'gold';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  LeftIcon?: LucideIcon;
  RightIcon?: LucideIcon;
  style?: ViewStyle;
}

const HEIGHTS: Record<ButtonSize, number> = {
  sm: sizes.control.sm,
  md: sizes.control.md,
  lg: sizes.control.lg,
};

const ICON_SIZES: Record<ButtonSize, number> = {
  sm: sizes.icon.sm,
  md: sizes.icon.md,
  lg: sizes.icon.md,
};

const TEXT_SIZES: Record<ButtonSize, number> = {
  sm: 13,
  md: 15,
  lg: 16,
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  LeftIcon,
  RightIcon,
  disabled,
  style,
  onPressIn,
  onPressOut,
  ...rest
}: ButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = (e: Parameters<NonNullable<PressableProps['onPressIn']>>[0]) => {
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 0,
    }).start();
    onPressIn?.(e);
  };

  const handlePressOut = (e: Parameters<NonNullable<PressableProps['onPressOut']>>[0]) => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 6,
    }).start();
    onPressOut?.(e);
  };

  const isFilled =
    variant === 'primary' || variant === 'danger' || variant === 'success' || variant === 'gold';
  const textColor = textColorFor(variant, disabled);
  const iconSize = ICON_SIZES[size];

  const inner = (
    <>
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <>
          {LeftIcon && <LeftIcon size={iconSize} color={textColor} />}
          <Text
            style={[styles.label, { fontSize: TEXT_SIZES[size], color: textColor }]}
            numberOfLines={1}
          >
            {label}
          </Text>
          {RightIcon && <RightIcon size={iconSize} color={textColor} />}
        </>
      )}
    </>
  );

  const containerStyle: ViewStyle = {
    height: HEIGHTS[size],
    paddingHorizontal: size === 'sm' ? spacing.md : spacing.lg,
    opacity: disabled ? 0.55 : 1,
    width: fullWidth ? '100%' : undefined,
    alignSelf: fullWidth ? 'stretch' : 'auto',
  };

  if (variant === 'primary') {
    return (
      <Animated.View style={[{ transform: [{ scale }] }, !disabled && shadows.brand, style]}>
        <Pressable
          {...rest}
          disabled={disabled || loading}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          hitSlop={hitSlop.sm}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <LinearGradient
            colors={gradients.brand as unknown as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.base, containerStyle]}
          >
            {inner}
          </LinearGradient>
        </Pressable>
      </Animated.View>
    );
  }

  if (variant === 'gold') {
    return (
      <Animated.View style={[{ transform: [{ scale }] }, !disabled && shadows.gold, style]}>
        <Pressable
          {...rest}
          disabled={disabled || loading}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          hitSlop={hitSlop.sm}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <LinearGradient
            colors={gradients.promoGold as unknown as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.base, containerStyle]}
          >
            {inner}
          </LinearGradient>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        {...rest}
        disabled={disabled || loading}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        hitSlop={hitSlop.sm}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.base,
          containerStyle,
          variantStyleFor(variant),
          pressed && !isFilled && { backgroundColor: colors.alpha.brandPress },
        ]}
      >
        {inner}
      </Pressable>
    </Animated.View>
  );
}

function variantStyleFor(variant: ButtonVariant): ViewStyle {
  switch (variant) {
    case 'secondary':
      return {
        backgroundColor: colors.white,
        borderWidth: 1,
        borderColor: colors.line2,
      };
    case 'ghost':
      return { backgroundColor: 'transparent' };
    case 'danger':
      return { backgroundColor: colors.danger };
    case 'success':
      return { backgroundColor: colors.success };
    case 'primary':
    case 'gold':
    default:
      return {};
  }
}

function textColorFor(variant: ButtonVariant, disabled?: boolean | null): string {
  if (disabled) return colors.text.disabled;
  switch (variant) {
    case 'primary':
    case 'danger':
    case 'success':
      return colors.white;
    case 'gold':
      return colors.brand.dark;
    case 'secondary':
      return colors.ink;
    case 'ghost':
      return colors.brand.red;
  }
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.lg,
    ...(Platform.OS === 'web' ? { cursor: 'pointer', userSelect: 'none' } : null),
  },
  label: {
    fontFamily: typography.button.fontFamily,
    includeFontPadding: false,
    textAlign: 'center',
  },
});
