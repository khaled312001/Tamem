/**
 * Size picker + add-on checklist for the product page.
 *
 * Two deliberately different controls, because they answer different
 * questions:
 *
 *  - **الحجم** is a radio: exactly one, and picking it REPLACES the price. The
 *    chip shows the size's own price rather than a "+" delta, because that's
 *    what the customer will actually pay — a "+20" on a large pizza would read
 *    as an extra charge on top of the small one.
 *  - **الإضافات** are checkboxes and DO add up, so those show "+" prices.
 *
 * Prices here are for display only. The order endpoint re-derives every one of
 * them from the database by id, so what's shown and what's charged can only
 * disagree if the menu changed between opening the page and checking out — in
 * which case the server rejects the line rather than silently repricing it.
 */
import { Check } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, radii, spacing } from '../../theme/tokens';

const ROW = 'row' as const;

export interface ProductVariant {
  id: string;
  nameAr: string;
  price: number;
}
export interface ProductAddon {
  id: string;
  nameAr: string;
  price: number;
}

interface Props {
  variants: ProductVariant[];
  addons: ProductAddon[];
  /** Live % discount on the product — applied to each SIZE price (0 = none). */
  discountPct?: number;
  variantId: string | null;
  addonIds: string[];
  onSelectVariant: (id: string) => void;
  onToggleAddon: (id: string) => void;
  disabled?: boolean;
}

function money(n: number): string {
  return `${n.toLocaleString('ar-EG')} ج.م`;
}

function ProductOptionsBase({
  variants,
  addons,
  discountPct = 0,
  variantId,
  addonIds,
  onSelectVariant,
  onToggleAddon,
  disabled,
}: Props) {
  if (variants.length === 0 && addons.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {variants.length > 0 && (
        <View>
          <View style={[styles.titleRow, { flexDirection: ROW }]}>
            <Text style={styles.title}>اختر الحجم</Text>
            <Text style={styles.required}>مطلوب</Text>
          </View>
          <View style={[styles.chips, { flexDirection: ROW }]}>
            {variants.map((v) => {
              const on = v.id === variantId;
              const now =
                discountPct > 0
                  ? Math.round(v.price * (1 - discountPct / 100) * 100) / 100
                  : v.price;
              const discounted = now < v.price;
              return (
                <Pressable
                  key={v.id}
                  onPress={() => !disabled && onSelectVariant(v.id)}
                  style={({ pressed }) => [
                    styles.chip,
                    on && styles.chipOn,
                    pressed && { opacity: 0.85 },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, disabled }}
                  accessibilityLabel={`${v.nameAr} — ${money(now)}`}
                >
                  <Text style={[styles.chipName, on && styles.chipNameOn]} numberOfLines={1}>
                    {v.nameAr}
                  </Text>
                  <View style={[styles.chipPriceRow, { flexDirection: ROW }]}>
                    <Text style={[styles.chipPrice, on && styles.chipPriceOn]} numberOfLines={1}>
                      {money(now)}
                    </Text>
                    {discounted && (
                      <Text style={styles.chipWas} numberOfLines={1}>
                        {money(v.price)}
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {addons.length > 0 && (
        <View style={variants.length > 0 ? { marginTop: spacing.lg } : undefined}>
          <View style={[styles.titleRow, { flexDirection: ROW }]}>
            <Text style={styles.title}>إضافات</Text>
            <Text style={styles.optional}>اختياري</Text>
          </View>
          <View style={styles.addonList}>
            {addons.map((a) => {
              const on = addonIds.includes(a.id);
              return (
                <Pressable
                  key={a.id}
                  onPress={() => !disabled && onToggleAddon(a.id)}
                  style={({ pressed }) => [
                    styles.addon,
                    { flexDirection: ROW },
                    on && styles.addonOn,
                    pressed && { opacity: 0.85 },
                  ]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, disabled }}
                  accessibilityLabel={`${a.nameAr} — زيادة ${money(a.price)}`}
                >
                  <View style={[styles.box, on && styles.boxOn]}>
                    {on && <Check size={13} color={colors.white} strokeWidth={3} />}
                  </View>
                  <Text style={styles.addonName} numberOfLines={1}>
                    {a.nameAr}
                  </Text>
                  <Text style={[styles.addonPrice, on && styles.addonPriceOn]}>
                    + {money(a.price)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

export const ProductOptions = memo(ProductOptionsBase);

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EFE7E2',
  },
  titleRow: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  title: {
    fontSize: 16,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyExtraBold,
    lineHeight: 26,
    includeFontPadding: false,
    textAlign: 'auto',
  },
  required: {
    fontSize: 11,
    color: colors.brand.red,
    backgroundColor: '#FDECEA',
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontFamily: fontFamilies.bodyBold,
    lineHeight: 18,
    includeFontPadding: false,
  },
  optional: {
    fontSize: 11,
    color: colors.brand.gray,
    backgroundColor: '#F3EFED',
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontFamily: fontFamilies.bodyBold,
    lineHeight: 18,
    includeFontPadding: false,
  },

  chips: { flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minWidth: 96,
    alignItems: 'center',
    gap: 2,
    borderWidth: 1.5,
    borderColor: '#EFE7E2',
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  chipOn: { borderColor: colors.brand.red, backgroundColor: '#FFF5F3' },
  chipName: {
    fontSize: 14,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyExtraBold,
    lineHeight: 22,
    includeFontPadding: false,
  },
  chipNameOn: { color: colors.brand.red },
  chipPriceRow: { alignItems: 'center', gap: 4 },
  chipPrice: {
    fontSize: 12,
    color: colors.brand.gray,
    fontFamily: fontFamilies.body,
    lineHeight: 20,
    includeFontPadding: false,
  },
  chipPriceOn: { color: colors.brand.red },
  chipWas: {
    fontSize: 10,
    color: colors.brand.gray,
    fontFamily: fontFamilies.body,
    textDecorationLine: 'line-through',
    lineHeight: 16,
    includeFontPadding: false,
  },

  addonList: { gap: spacing.sm },
  addon: {
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: '#EFE7E2',
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
  },
  addonOn: { borderColor: colors.brand.red, backgroundColor: '#FFF8F6' },
  box: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#D9D2CE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { borderColor: colors.brand.red, backgroundColor: colors.brand.red },
  addonName: {
    flex: 1,
    fontSize: 14,
    color: colors.brand.dark,
    fontFamily: fontFamilies.body,
    lineHeight: 22,
    includeFontPadding: false,
    textAlign: 'auto',
  },
  addonPrice: {
    fontSize: 13,
    color: colors.brand.gray,
    fontFamily: fontFamilies.bodyBold,
    lineHeight: 21,
    includeFontPadding: false,
  },
  addonPriceOn: { color: colors.brand.red },
});
