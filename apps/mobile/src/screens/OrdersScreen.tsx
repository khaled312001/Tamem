import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Package } from 'lucide-react-native';
import { memo, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ORDER_STATUS_AR, type OrderStatus } from '@tamem/types';

import { GradientHeader } from '../components/GradientHeader';
import {
  AnimatedListItem,
  CardListSkeleton,
  EmptyState,
  ForwardChevron,
  StatusPill,
} from '../components/ui';
import { api } from '../lib/api';
import { connectSocket } from '../lib/socket';
import type { OrdersStackParamList } from '../navigation/OrdersStack';
import { colors, fontFamilies, fontSizes, radii, shadows, spacing } from '../theme/tokens';

interface OrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  category: 'DELIVERY' | 'SHIPPING' | 'MERCHANT';
  quotedPrice?: number | null;
  finalPrice?: number | null;
  createdAt: string;
  service?: { nameAr: string };
}

type Nav = NativeStackNavigationProp<OrdersStackParamList, 'OrdersList'>;

const TABS = [
  { key: 'current', label: 'الحالية' },
  { key: 'completed', label: 'المكتملة' },
  { key: 'cancelled', label: 'الملغاة' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const ACTIVE_STATUSES = new Set<OrderStatus>([
  'NEW',
  'UNDER_REVIEW',
  'PRICED',
  'AWAITING_CUSTOMER_APPROVAL',
  'ACCEPTED',
  'DRIVER_ASSIGNED',
  'PICKED_UP',
  'IN_ROUTE',
]);
const COMPLETED_STATUSES = new Set<OrderStatus>(['DELIVERED', 'COMPLETED']);
const CANCELLED_STATUSES = new Set<OrderStatus>(['CANCELLED', 'REJECTED']);

const tickHaptic = () => {
  if (Platform.OS !== 'web') void Haptics.selectionAsync();
};

const CATEGORY_LABEL: Record<OrderListItem['category'], string> = {
  DELIVERY: 'دليفري',
  SHIPPING: 'شحن',
  MERCHANT: 'تاجر',
};

interface OrderCardProps {
  item: OrderListItem;
  index: number;
  onPress: (id: string) => void;
}

const OrderCard = memo(function OrderCard({ item, index, onPress }: OrderCardProps) {
  const priceValue = item.finalPrice ?? item.quotedPrice;
  const serviceName = item.service?.nameAr ?? CATEGORY_LABEL[item.category];
  const dateLabel = new Date(item.createdAt).toLocaleDateString('ar-EG', {
    day: 'numeric',
    month: 'short',
  });
  return (
    <AnimatedListItem index={index}>
      <Pressable
        onPress={() => onPress(item.id)}
        style={({ pressed }) => [
          styles.card,
          shadows.sm,
          pressed && { opacity: 0.92, transform: [{ scale: 0.997 }] },
        ]}
      >
        {/* Top: service name (primary headline) + status pill on the END side */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderText}>
            <Text style={styles.cardServiceName} numberOfLines={1}>
              {serviceName}
            </Text>
            <View style={styles.cardMetaRow}>
              <Text style={styles.cardOrderNumber}>#{item.orderNumber}</Text>
              <Text style={styles.cardMetaDot}>•</Text>
              <Text style={styles.cardDate}>{dateLabel}</Text>
            </View>
          </View>
          <StatusPill label={ORDER_STATUS_AR[item.status]} color={colors.status[item.status]} dot />
        </View>

        {/* Divider */}
        <View style={styles.cardDivider} />

        {/* Footer: category chip + price + chevron */}
        <View style={styles.cardFooter}>
          <View style={styles.cardCategoryChip}>
            <Text style={styles.cardCategoryText}>{CATEGORY_LABEL[item.category]}</Text>
          </View>
          <View style={styles.cardFooterEnd}>
            {priceValue ? (
              <Text style={styles.cardPrice}>{Number(priceValue).toLocaleString('ar-EG')} ج.م</Text>
            ) : (
              <Text style={styles.cardNoPrice}>قيد التسعير</Text>
            )}
            <ForwardChevron size={16} color={colors.text.muted} />
          </View>
        </View>
      </Pressable>
    </AnimatedListItem>
  );
});

export function OrdersScreen() {
  const [tab, setTab] = useState<TabKey>('current');
  const navigation = useNavigation<Nav>();
  const qc = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery<OrderListItem[]>({
    queryKey: ['orders-mine'],
    queryFn: () => api.raw.get('/orders/mine').then((r) => r.data.data),
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await connectSocket();
      const refresh = () => {
        if (!cancelled) qc.invalidateQueries({ queryKey: ['orders-mine'] });
      };
      s.on('order:status', refresh);
      s.on('order:new', refresh);
      return () => {
        s.off('order:status', refresh);
        s.off('order:new', refresh);
      };
    })();
    return () => {
      cancelled = true;
    };
  }, [qc]);

  const filtered = useMemo(() => {
    const list = data ?? [];
    if (tab === 'current') return list.filter((o) => ACTIVE_STATUSES.has(o.status));
    if (tab === 'completed') return list.filter((o) => COMPLETED_STATUSES.has(o.status));
    return list.filter((o) => CANCELLED_STATUSES.has(o.status));
  }, [data, tab]);

  const counts = useMemo(() => {
    const list = data ?? [];
    return {
      current: list.filter((o) => ACTIVE_STATUSES.has(o.status)).length,
      completed: list.filter((o) => COMPLETED_STATUSES.has(o.status)).length,
      cancelled: list.filter((o) => CANCELLED_STATUSES.has(o.status)).length,
    };
  }, [data]);

  const openOrder = (id: string) => navigation.navigate('OrderTracking', { orderId: id });

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <GradientHeader greeting="طلباتي" location="سجلّ كل طلباتك" />

      <View style={styles.tabsRow}>
        {TABS.map((t) => {
          const isOn = t.key === tab;
          const count = counts[t.key];
          return (
            <Pressable
              key={t.key}
              onPress={() => {
                tickHaptic();
                setTab(t.key);
              }}
              style={[styles.tab, isOn && styles.tabOn]}
            >
              <Text style={[styles.tabText, isOn && styles.tabTextOn]}>{t.label}</Text>
              {count > 0 && (
                <View style={[styles.tabBadge, isOn && styles.tabBadgeOn]}>
                  <Text style={[styles.tabBadgeText, isOn && styles.tabBadgeTextOn]}>{count}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <View style={styles.listPad}>
          <CardListSkeleton count={4} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(o) => o.id}
          contentContainerStyle={[
            styles.listPad,
            filtered.length === 0 && { flexGrow: 1, justifyContent: 'center' },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isFetching}
              onRefresh={refetch}
              tintColor={colors.brand.red}
            />
          }
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
          ListEmptyComponent={
            <EmptyState
              icon={<Package size={36} color={colors.brand.red} />}
              title={
                tab === 'current'
                  ? 'لا توجد طلبات نشطة الآن'
                  : tab === 'completed'
                    ? 'لا توجد طلبات مكتملة بعد'
                    : 'لا توجد طلبات ملغاة'
              }
              subtitle={
                tab === 'current'
                  ? 'ابدأ طلب جديد من الصفحة الرئيسية وسيظهر هنا.'
                  : tab === 'completed'
                    ? 'الطلبات اللي وصلت بنجاح هتلاقيها هنا.'
                    : undefined
              }
            />
          }
          renderItem={({ item, index }) => (
            <OrderCard item={item} index={index} onPress={openOrder} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  // Tabs
  tabsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    backgroundColor: colors.white,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radii.lg,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radii.md,
  },
  tabOn: { backgroundColor: colors.brand.red },
  tabText: {
    fontSize: fontSizes.sm,
    color: colors.text.muted,
    fontFamily: fontFamilies.bodyBold,
  },
  tabTextOn: { color: colors.white, fontFamily: fontFamilies.headingBold },
  tabBadge: {
    minWidth: 20,
    paddingHorizontal: 6,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeOn: { backgroundColor: 'rgba(255,255,255,0.25)' },
  tabBadgeText: {
    fontSize: 10,
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.brand.red,
  },
  tabBadgeTextOn: { color: colors.white },
  // List
  listPad: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  // Card — denser, service-name-primary, RTL-natural reading order
  card: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardHeaderText: { flex: 1 },
  cardServiceName: {
    fontSize: fontSizes.md,
    color: colors.ink,
    fontFamily: fontFamilies.headingBold,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  cardMetaRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  cardOrderNumber: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
  },
  cardMetaDot: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
  },
  cardDate: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
  },
  cardDivider: {
    height: 1,
    backgroundColor: colors.line,
    marginVertical: spacing.sm,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardCategoryChip: {
    backgroundColor: colors.brand.redLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  cardCategoryText: {
    fontSize: fontSizes.xs,
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  cardFooterEnd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardPrice: {
    fontSize: fontSizes.md,
    color: colors.brand.red,
    fontFamily: fontFamilies.headingBlack,
  },
  cardNoPrice: {
    fontSize: fontSizes.xs,
    color: colors.warning,
    fontFamily: fontFamilies.bodyExtraBold,
  },
});
