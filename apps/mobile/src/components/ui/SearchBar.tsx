import { Search, X } from 'lucide-react-native';
import { useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { colors, hitSlop, radii, spacing, typography } from '../../theme/tokens';

/**
 * SearchBar — unified search input with leading icon, clear button, and
 * focused-state ring. Use across Home/Stores/Browse.
 *
 *   <SearchBar
 *      value={q}
 *      onChangeText={setQ}
 *      placeholder="ابحث عن مطعم أو طلب"
 *      onSubmit={runSearch}
 *   />
 */
export interface SearchBarProps extends Omit<TextInputProps, 'style'> {
  value: string;
  onChangeText: (v: string) => void;
  onSubmit?: () => void;
  onClear?: () => void;
  containerStyle?: ViewStyle;
  /** Render trailing slot (e.g. filter button) next to the input. */
  rightSlot?: React.ReactNode;
}

export function SearchBar({
  value,
  onChangeText,
  onSubmit,
  onClear,
  placeholder = 'ابحث...',
  containerStyle,
  rightSlot,
  ...rest
}: SearchBarProps) {
  const inputRef = useRef<TextInput>(null);
  const focused = useRef(new Animated.Value(0)).current;

  const handleFocus = () => {
    Animated.timing(focused, { toValue: 1, duration: 180, useNativeDriver: false }).start();
  };
  const handleBlur = () => {
    Animated.timing(focused, { toValue: 0, duration: 180, useNativeDriver: false }).start();
  };

  const borderColor = focused.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.line2, colors.brand.red],
  });

  const clear = () => {
    onChangeText('');
    onClear?.();
    inputRef.current?.focus();
  };

  return (
    <View style={[styles.outer, containerStyle]}>
      <Animated.View style={[styles.inner, { borderColor }]}>
        <Search size={18} color={colors.text.muted} />
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          placeholderTextColor={colors.text.placeholder}
          returnKeyType="search"
          style={styles.input}
          {...rest}
        />
        {value.length > 0 && (
          <Pressable
            onPress={clear}
            hitSlop={hitSlop.sm}
            accessibilityLabel="مسح"
            style={styles.clearBtn}
          >
            <X size={14} color={colors.white} />
          </Pressable>
        )}
      </Animated.View>
      {rightSlot}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  inner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    borderWidth: 1,
    minHeight: 44,
  },
  input: {
    flex: 1,
    color: colors.ink,
    fontSize: typography.body.fontSize,
    fontFamily: typography.body.fontFamily,
    paddingVertical: 0,
    textAlign: 'right',
    includeFontPadding: false,
  },
  clearBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.text.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
