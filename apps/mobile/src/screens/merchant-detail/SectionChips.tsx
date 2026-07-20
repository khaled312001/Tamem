/**
 * In-store section filter — "بيتزا / كريب / كشري" for a restaurant, or
 * "أدوية / عناية شخصية" for a pharmacy.
 *
 * The sections come from Product.categoryName, which the merchant's own sync
 * feed already fills in and an admin can edit per product. That means there is
 * no second taxonomy to keep in step with the products themselves — a section
 * exists exactly as long as something is in it.
 *
 * Counts are shown because with 2,000 items in "medicines" and 22 in
 * "cosmetics", the sizes tell the customer where it's worth looking.
 */
import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, radii, spacing } from '../../theme/tokens';

const ROW = 'row' as const;

export interface ProductSection {
  name: string;
  count: number;
}

interface Props {
  sections: ProductSection[];
  /** null = "الكل". */
  active: string | null;
  onChange: (section: string | null) => void;
  totalCount: number;
}

function SectionChipsBase({ sections, active, onChange, totalCount }: Props) {
  // One section is the same as none — every product would be in it.
  if (sections.length < 2) return null;

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.row, { flexDirection: ROW }]}
      >
        <Chip label="الكل" count={totalCount} on={active === null} onPress={() => onChange(null)} />
        {sections.map((s) => (
          <Chip
            key={s.name}
            label={s.name}
            count={s.count}
            on={active === s.name}
            // Tapping the active chip clears it — otherwise the only way back
            // to "الكل" is to scroll the strip back to the start.
            onPress={() => onChange(active === s.name ? null : s.name)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const Chip = memo(function Chip({
  label,
  count,
  on,
  onPress,
}: {
  label: string;
  count: number;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${label}، ${count} منتج`}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
        {label}
      </Text>
      <View style={[styles.badge, on && styles.badgeOn]}>
        <Text style={[styles.badgeText, on && styles.badgeTextOn]}>{count}</Text>
      </View>
    </Pressable>
  );
});

export const SectionChips = memo(SectionChipsBase);

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: spacing.sm },
  chip: {
    flexDirection: ROW,
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#EFE7E2',
  },
  chipOn: { backgroundColor: colors.brand.red, borderColor: colors.brand.red },
  chipText: {
    fontSize: 13,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyBold,
    lineHeight: 20,
    includeFontPadding: false,
  },
  chipTextOn: { color: colors.white },
  badge: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radii.pill,
    backgroundColor: '#F4EEEA',
    alignItems: 'center',
  },
  badgeOn: { backgroundColor: 'rgba(255,255,255,0.25)' },
  badgeText: {
    fontSize: 11,
    color: colors.brand.gray,
    fontFamily: fontFamilies.bodyExtraBold,
    lineHeight: 17,
    includeFontPadding: false,
  },
  badgeTextOn: { color: colors.white },
});
