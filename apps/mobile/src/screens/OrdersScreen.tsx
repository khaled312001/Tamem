import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Package } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ORDER_STATUS_AR, type OrderStatus } from '@tamem/types';

import { GradientHeader } from '../components/GradientHeader';
import { api } from '../lib/api';
import { connectSocket } from '../lib/socket';
import type { OrdersStackParamList } from '../navigation/OrdersStack';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

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

const TABS = [
  { key: 'current', label: 'الحالية' },
  { key: 'completed', label: 'المكتملة' },
] as const;

const ACTIVE_STATUSES = new Set<OrderStatus>([
  'NEW',
  'UNDER_REVIEW',
  'PRICED',
  'AWAITING_CUSTOMER_APPROVAL',
  'ACCEPTED',
  'DRIVER_ASSIGNED',
  'PICKED_UP',
  'IN_ROUTE',
  'DELIVERED',
]);

type Nav = NativeStackNavigationProp<OrdersStackParamList, 'OrdersList'>;

export function OrdersScreen() {
  const [tab, setTab] = useState<'current' | 'completed'>('current');
  const navigation = useNavigation<Nav>();
  const qc = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery<OrderListItem[]>({
    queryKey: ['orders-mine'],
    queryFn: () => api.raw.get('/orders/mine').then((r) => r.data.data),
  });

  // Realtime: subscribe to my user:<id> channel so status updates from admin
  // refresh the list immediately.
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

  const orders = (data ?? []).filter((o) => {
    const isActive = ACTIVE_STATUSES.has(o.status);
    return tab === 'current' ? isActive : !isActive;
  });

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <GradientHeader greeting="طلباتي" location="سجلّ كل طلباتك" />

      <View style={styles.tabsRow}>
        {TABS.map((t) => {
          const isOn = t.key === tab;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.tab, isOn && styles.tabOn]}
            >
              <Text style={[styles.tabText, isOn && styles.tabTextOn]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.brand.red} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Package size={48} color={colors.text.muted} />
              <Text style={styles.emptyText}>
                {tab === 'current' ? 'لا توجد طلبات حالية' : 'لا توجد طلبات مكتملة'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate('OrderTracking', { orderId: item.id })}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.orderNum}>#{item.orderNumber}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: colors.status[item.status] + '20' },
                  ]}
                >
                  <Text style={[styles.statusText, { color: colors.status[item.status] }]}>
                    {ORDER_STATUS_AR[item.status]}
                  </Text>
                </View>
              </View>
              <Text style={styles.serviceName}>{item.service?.nameAr ?? item.category}</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.timeText}>
                  {new Date(item.createdAt).toLocaleString('ar-EG')}
                </Text>
                {(item.finalPrice || item.quotedPrice) && (
                  <Text style={styles.priceText}>
                    {Number(item.finalPrice ?? item.quotedPrice ?? 0).toLocaleString('ar-EG')} ج.م
                  </Text>
                )}
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  tabsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    backgroundColor: colors.soft,
    margin: spacing.lg,
    borderRadius: radii.md,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radii.md },
  tabOn: { backgroundColor: colors.white },
  tabText: {
    fontSize: fontSizes.sm,
    color: colors.text.muted,
    fontFamily: fontFamilies.bodyBold,
  },
  tabTextOn: { color: colors.brand.red },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
  },
  emptyText: { color: colors.text.muted, fontFamily: fontFamilies.body, fontSize: fontSizes.sm },
  card: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  pressed: { opacity: 0.85 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderNum: { fontFamily: fontFamilies.bodyExtraBold, fontSize: fontSizes.sm, color: colors.ink },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  statusText: { fontSize: 10, fontFamily: fontFamilies.bodyExtraBold },
  serviceName: {
    fontSize: fontSizes.sm,
    color: colors.text.secondary,
    fontFamily: fontFamilies.body,
    marginTop: spacing.xs,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  timeText: { fontSize: fontSizes.xs, color: colors.text.muted, fontFamily: fontFamilies.body },
  priceText: {
    fontSize: fontSizes.sm,
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
  },
});
