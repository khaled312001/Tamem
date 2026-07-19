/**
 * One product row inside a store page.
 *
 * The add button writes straight to the cart store, so the customer never has
 * to open the product page to order — which is the main thing the old layout
 * (a plain navigate-only row) was missing.
 *
 * Adding is blocked while the store is closed: the cart groups by merchant and
 * the order would be rejected at checkout anyway, so refusing here with a
 * visible reason beats failing later.
 */
import { Minus, Plus, Store } from 'lucide-react-native';
import { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { MoneyText } from '../../components/ui';
import { productPrice } from '../../lib/productPrice';
import { colors, fontFamilies, radii, shadows, spacing } from '../../theme/tokens';

const ROW = 'row' as const;
const THUMB = 76;

export interface RowProduct {
  id: string;
  nameAr: string;
  price: number | string;
  salePrice?: number | string | null;
  discount?: number | string | null;
  imageUrl?: string | null;
  description?: string | null;
}

interface Props {
  product: RowProduct;
  /** Current quantity in the cart; 0 hides the stepper. */
  quantity: number;
  disabled?: boolean;
  onPress: () => void;
  onAdd: () => void;
  onRemove: () => void;
}

function MerchantProductRowBase({
  product: p,
  quantity,
  disabled,
  onPress,
  onAdd,
  onRemove,
}: Props) {
  const price = productPrice(p);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, shadows.sm, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={p.nameAr}
    >
      <View style={styles.thumb}>
        {p.imageUrl ? (
          <Image source={{ uri: p.imageUrl }} style={styles.thumbImg} resizeMode="cover" />
        ) : (
          <Store size={22} color={colors.brand.red} />
        )}
      </View>

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {p.nameAr}
        </Text>
        {!!p.description && (
          <Text style={styles.desc} numberOfLines={2}>
            {p.description}
          </Text>
        )}
        {/* Same helper the product page and home rails use, so one product
            can never show two prices. */}
        <View style={[styles.priceRow, { flexDirection: ROW }]}>
          <MoneyText amount={price.now} tone="brand" size="sm" />
          {price.was != null && (
            <Text style={styles.wasPrice}>{Math.round(price.was).toLocaleString('ar-EG')}</Text>
          )}
          {price.off > 0 && (
            <View style={styles.offPill}>
              <Text style={styles.offPillText}>-{price.off}%</Text>
            </View>
          )}
        </View>
      </View>

      {quantity > 0 ? (
        <View style={[styles.stepper, { flexDirection: ROW }]}>
          <Pressable onPress={onRemove} hitSlop={6} style={styles.stepBtn}>
            <Minus size={15} color={colors.brand.red} />
          </Pressable>
          <Text style={styles.qty}>{quantity}</Text>
          <Pressable onPress={onAdd} hitSlop={6} style={styles.stepBtn} disabled={disabled}>
            <Plus size={15} color={disabled ? colors.brand.gray : colors.brand.red} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={onAdd}
          disabled={disabled}
          hitSlop={6}
          style={({ pressed }) => [
            styles.addBtn,
            disabled && styles.addBtnOff,
            pressed && { opacity: 0.7 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`أضف ${p.nameAr}`}
        >
          <Plus size={18} color={disabled ? colors.brand.gray : colors.white} />
        </Pressable>
      )}
    </Pressable>
  );
}

export const MerchantProductRow = memo(MerchantProductRowBase);

const styles = StyleSheet.create({
  row: {
    flexDirection: ROW,
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#EFE7E2',
    padding: spacing.sm,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radii.md,
    backgroundColor: '#F6F0EC',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImg: { width: '100%', height: '100%' },

  info: { flex: 1, gap: 2 },
  name: {
    fontSize: 14,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyExtraBold,
    textAlign: 'auto',
  },
  desc: {
    fontSize: 11,
    color: colors.brand.gray,
    fontFamily: fontFamilies.body,
    textAlign: 'auto',
  },

  priceRow: { alignItems: 'center', gap: 6 },
  wasPrice: {
    fontSize: 11,
    color: colors.brand.gray,
    fontFamily: fontFamilies.body,
    textDecorationLine: 'line-through',
  },
  offPill: {
    backgroundColor: '#FDECEA',
    borderRadius: radii.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  offPillText: { fontSize: 10, color: colors.brand.red, fontFamily: fontFamilies.bodyExtraBold },

  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brand.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnOff: { backgroundColor: '#F1EBE7' },

  stepper: {
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.brand.red,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stepBtn: { padding: 2 },
  qty: {
    minWidth: 16,
    textAlign: 'center',
    fontSize: 14,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  pressed: { opacity: 0.9 },
});
