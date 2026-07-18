/**
 * "وصول سريع" — shortcuts into screens that already exist elsewhere in the app
 * (orders, wallet, favourites, coupons). Purely navigational: every target and
 * its params are decided by HomeV2Screen, this file just draws the row.
 */
import type { LucideIcon } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, radii, spacing } from '../../../theme/tokens';

// React Native already lays `flexDirection: 'row'` out right-to-left when
// I18nManager RTL is on. Adding 'row-reverse' on top of that flips it a
// SECOND time, back to left-to-right — which is why the header rendered
// mirrored. Plain 'row' is correct on native; the web build gets its
// direction from the document's dir="rtl".
const ROW = 'row' as const;

export interface QuickAction {
  key: string;
  label: string;
  Icon: LucideIcon;
  tint: string;
  onPress: () => void;
}

function QuickActionsSectionBase({ actions }: { actions: QuickAction[] }) {
  if (!actions.length) return null;

  return (
    <View>
      <Text style={styles.sectionTitle}>وصول سريع</Text>

      <View style={[styles.row, { flexDirection: ROW }]}>
        {actions.map((a) => (
          <Pressable
            key={a.key}
            onPress={a.onPress}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={a.label}
          >
            <View style={[styles.iconWrap, { backgroundColor: `${a.tint}1A` }]}>
              <a.Icon size={22} color={a.tint} strokeWidth={1.9} />
            </View>
            <Text style={styles.label} numberOfLines={1}>
              {a.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export const QuickActionsSection = memo(QuickActionsSectionBase);

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 18,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyExtraBold,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: spacing.md,
  },
  row: { gap: spacing.md },
  item: { flex: 1, alignItems: 'center', gap: 6 },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyBold,
    textAlign: 'center',
  },
  pressed: { opacity: 0.75 },
});
