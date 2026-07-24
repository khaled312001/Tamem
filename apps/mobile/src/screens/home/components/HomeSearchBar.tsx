/**
 * Collapsed search pill. Tapping it opens the existing SearchOverlay, which
 * already owns the TextInput, the 300ms debounce and the live merchant/product
 * suggestions — so no query is issued from here and no keystroke hits the API.
 */
import { Mic, Search } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, shadows, spacing } from '../../../theme/tokens';

// React Native already lays `flexDirection: 'row'` out right-to-left when
// I18nManager RTL is on. Adding 'row-reverse' on top of that flips it a
// SECOND time, back to left-to-right — which is why the header rendered
// mirrored. Plain 'row' is correct on native; the web build gets its
// direction from the document's dir="rtl".
const ROW = 'row' as const;

interface Props {
  onPress: () => void;
  /**
   * Voice ordering. The app already records and uploads audio (the voice mode
   * inside QuickOrderSheet), so this is a shortcut into an existing flow rather
   * than speech-to-text.
   */
  onPressVoice?: () => void;
  placeholder?: string;
}

function HomeSearchBarBase({
  onPress,
  onPressVoice,
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

      {!!onPressVoice && (
        <Pressable
          onPress={onPressVoice}
          hitSlop={10}
          style={({ pressed }) => [styles.micBox, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="اطلب بالصوت"
        >
          <Mic size={18} color={colors.white} />
        </Pressable>
      )}
    </Pressable>
  );
}

export const HomeSearchBar = memo(HomeSearchBarBase);

const styles = StyleSheet.create({
  bar: {
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#EFE7E2',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    ...shadows.sm,
  },
  iconBox: { width: 32, alignItems: 'center', justifyContent: 'center' },
  micBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.brand.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
