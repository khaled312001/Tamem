/**
 * "طلبك الحالي" strip. Rendered only while an order is in flight — the caller
 * decides that using ACTIVE_STATUSES, so this component stays presentational.
 */
import { Package, ShoppingBag, Truck } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ForwardChevron } from '../../../components/ui';
import { colors, fontFamilies, radii, shadows, spacing } from '../../../theme/tokens';
import type { ActiveOrder } from '../homeData';

import { ORDER_STATUS_AR } from '@tamem/types';

// React Native already lays `flexDirection: 'row'` out right-to-left when
// I18nManager RTL is on. Adding 'row-reverse' on top of that flips it a
// SECOND time, back to left-to-right — which is why the header rendered
// mirrored. Plain 'row' is correct on native; the web build gets its
// direction from the document's dir="rtl".
const ROW = 'row' as const;

/** Category → glyph. Falls back to the delivery bag for unknown categories. */
function iconFor(category?: string) {
  if (category === 'SHIPPING') return Package;
  if (category === 'MERCHANT') return Truck;
  return ShoppingBag;
}

interface Props {
  order: ActiveOrder;
  onPress: () => void;
}

function ActiveOrderCardBase({ order, onPress }: Props) {
  const Icon = iconFor(order.category);
  const statusAr = ORDER_STATUS_AR[order.status] ?? order.status;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { flexDirection: ROW }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`طلبك الحالي رقم ${order.orderNumber}`}
    >
      <View style={styles.iconWrap}>
        <Icon size={22} color={colors.brand.red} />
      </View>

      <View style={styles.texts}>
        <Text style={styles.title}>طلبك الحالي</Text>
        <Text style={styles.number} numberOfLines={1}>
          #{order.orderNumber}
          {order.service?.nameAr ? ` · ${order.service.nameAr}` : ''}
        </Text>
      </View>

      <View style={styles.statusWrap}>
        <Text style={styles.status} numberOfLines={1}>
          {statusAr}
        </Text>
      </View>

      <ForwardChevron size={20} color={colors.brand.gray} />
    </Pressable>
  );
}

export const ActiveOrderCard = memo(ActiveOrderCardBase);

const styles = StyleSheet.create({
  card: {
    minHeight: 84,
    maxHeight: 96,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#EFE7E2',
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
    ...shadows.sm,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: '#FFF1F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, gap: 2 },
  title: {
    fontSize: 13,
    color: colors.brand.gray,
    fontFamily: fontFamilies.body,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  number: {
    fontSize: 15,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyExtraBold,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  statusWrap: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: '#E9F7EF',
  },
  status: {
    fontSize: 12,
    color: '#20A85B',
    fontFamily: fontFamilies.bodyBold,
  },
  pressed: { opacity: 0.85 },
});
