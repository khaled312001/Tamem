/**
 * Collapsed search pill. Tapping it opens the existing SearchOverlay, which
 * already owns the TextInput, the 300ms debounce and the live merchant/product
 * suggestions — so no query is issued from here and no keystroke hits the API.
 */
import { Search, SlidersHorizontal } from 'lucide-react-native';
import { memo } from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, shadows, spacing } from '../../../theme/tokens';

const ROW = I18nManager.isRTL ? 'row-reverse' : ('row' as const);

interface Props {
  onPress: () => void;
  /** Opens the same overlay; kept separate so filters can deep-link later. */
  onPressFilters?: () => void;
  placeholder?: string;
}

function HomeSearchBarBase({
  onPress,
  onPressFilters,
  placeholder = 'ابحث عن مطعم، محل، منتج أو خدمة...',
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.bar, { flexDirection: ROW }, pressed && styles.pressed]}
      accessibilityRole="search"
      accessibilityLabel="ابحث"
    >
      <View style={styles.iconBox}>
        <Search size={20} color={colors.brand.gray} />
      </View>

      <Text style={styles.placeholder} numberOfLines={1}>
        {placeholder}
      </Text>

      <Pressable
        onPress={onPressFilters ?? onPress}
        hitSlop={10}
        style={({ pressed }) => [styles.iconBox, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="تصفية"
      >
        <SlidersHorizontal size={20} color={colors.brand.dark} />
      </Pressable>
    </Pressable>
  );
}

export const HomeSearchBar = memo(HomeSearchBarBase);

const styles = StyleSheet.create({
  bar: {
    height: 60,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#EFE7E2',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    ...shadows.sm,
  },
  iconBox: { width: 32, alignItems: 'center', justifyContent: 'center' },
  placeholder: {
    flex: 1,
    fontSize: 14,
    color: colors.brand.gray,
    fontFamily: fontFamilies.body,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  pressed: { opacity: 0.7 },
});
