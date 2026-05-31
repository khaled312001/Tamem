import { Heart } from 'lucide-react-native';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { useFavorite } from '../lib/favorites';
import { showToast } from '../lib/toast';
import { colors, radii, shadows } from '../theme/tokens';

interface HeartButtonProps {
  merchantId: string;
  merchantName?: string;
  size?: 'sm' | 'md';
  /** Floating button on top of an image — adds white background + shadow. */
  floating?: boolean;
  style?: ViewStyle;
}

/**
 * Toggleable heart for adding a merchant to the local favorites list.
 * Fires a toast on toggle so the action is undoable from anywhere.
 */
export function HeartButton({
  merchantId,
  merchantName,
  size = 'md',
  floating,
  style,
}: HeartButtonProps) {
  const { isFavorite, toggle } = useFavorite(merchantId);
  const dimension = size === 'sm' ? 28 : 36;
  const iconSize = size === 'sm' ? 14 : 18;

  return (
    <Pressable
      onPress={(e) => {
        e.stopPropagation();
        void toggle().then((added) => {
          if (added === undefined) return;
          showToast({
            title: added ? 'تمت إضافته للمفضلة' : 'تم إزالته من المفضلة',
            message: merchantName,
            tone: added ? 'success' : 'info',
          });
        });
      }}
      hitSlop={6}
      accessibilityLabel={isFavorite ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
      style={({ pressed }) => [
        styles.btn,
        {
          width: dimension,
          height: dimension,
          borderRadius: dimension / 2,
        },
        floating && [styles.floating, shadows.sm],
        pressed && { transform: [{ scale: 0.9 }] },
        style,
      ]}
    >
      <Heart
        size={iconSize}
        color={isFavorite ? colors.brand.red : colors.text.muted}
        fill={isFavorite ? colors.brand.red : 'transparent'}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  floating: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.pill,
  },
});
