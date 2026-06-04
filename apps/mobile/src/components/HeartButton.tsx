import { Heart } from 'lucide-react-native';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { useFavoriteItem, type FavoriteCollection } from '../lib/favorites';
import { haptic } from '../lib/haptics';
import { showToast } from '../lib/toast';
import { colors, radii, shadows } from '../theme/tokens';

interface HeartButtonProps {
  /** Backwards-compat: pass merchantId OR (collection + id). */
  merchantId?: string;
  /** Generic: which collection to toggle in. */
  collection?: FavoriteCollection;
  /** Generic: id of the item being favorited. */
  id?: string;
  /** Display name used in the undo toast. */
  merchantName?: string;
  size?: 'sm' | 'md';
  /** Floating button on top of an image — adds white background + shadow. */
  floating?: boolean;
  style?: ViewStyle;
}

/**
 * Toggleable heart for adding a merchant or product to the local favorites
 * list. Fires a toast on toggle so the action is undoable from anywhere.
 */
export function HeartButton({
  merchantId,
  collection,
  id,
  merchantName,
  size = 'md',
  floating,
  style,
}: HeartButtonProps) {
  // Resolve which collection we're targeting. Old call sites pass merchantId
  // and assume 'merchant'; new ones pass collection+id explicitly.
  const targetCollection: FavoriteCollection = collection ?? 'merchant';
  const targetId = id ?? merchantId;
  const { isFavorite, toggle } = useFavoriteItem(targetCollection, targetId);
  const dimension = size === 'sm' ? 28 : 36;
  const iconSize = size === 'sm' ? 14 : 18;

  return (
    <Pressable
      onPress={(e) => {
        e.stopPropagation();
        haptic.tap();
        void toggle().then((added) => {
          if (added === undefined) return;
          const isProduct = targetCollection === 'product';
          showToast({
            title: added
              ? isProduct
                ? 'تمت إضافته لقائمة الرغبات'
                : 'تمت إضافته للمفضلة'
              : isProduct
                ? 'تم إزالته من قائمة الرغبات'
                : 'تم إزالته من المفضلة',
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
