import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Package, RotateCcw } from 'lucide-react-native';
import { memo, useEffect, useState } from 'react';
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
import { AnimatedListItem, CardListSkeleton, EmptyState, StatusPill } from '../components/ui';
import { api } from '../lib/api';
import { useSocketEvents } from '../lib/useSocketEvents';
import { showToast } from '../lib/toast';
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
  /** Populated for multi-merchant parent orders only. */
  _count?: { subOrders: number };
}

type Nav = NativeStackNavigationProp<OrdersStackParamList, 'OrdersList'>;

const TABS = [
  { key: 'current', label: 'الحالية' },
  { key: 'completed', label: 'المكتملة' },
  { key: 'cancelled', label: 'الملغاة' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/** Orders per page. The tab groups + paging are resolved server-side. */
const PAGE_SIZE = 10;

/** Module-level so the array identity never changes across renders. */
const SOCKET_EVENTS = ['order:status', 'order:new'];

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
  onReorder?: (id: string) => void;
  reorderingId?: string | null;
}

const OrderCard = memo(function OrderCard({
  item,
  index,
  onPress,
  onReorder,
  reorderingId,
}: OrderCardProps) {
  const priceValue = item.finalPrice ?? item.quotedPrice;
  const serviceName = item.service?.nameAr ?? CATEGORY_LABEL[item.category];
  const dateLabel = new Date(item.createdAt).toLocaleDateString('ar-EG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const showReorder = !!onReorder;
  const isReordering = reorderingId === item.id;

  return (
    <AnimatedListItem index={index}>
      <Pressable
        onPress={() => onPress(item.id)}
        style={({ pressed }) => [styles.card, shadows.sm, pressed && { opacity: 0.94 }]}
      >
        {/* Top row: service name + status pill */}
        <View style={styles.cardTop}>
          <Text style={styles.cardServiceName} numberOfLines={1}>
            {serviceName}
          </Text>
          <StatusPill label={ORDER_STATUS_AR[item.status]} color={colors.status[item.status]} dot />
        </View>

        {/* Order number + multi-merchant badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Text style={styles.cardOrderNumber}>#{item.orderNumber}</Text>
          {item._count && item._count.subOrders > 1 ? (
            <View style={styles.multiBadge}>
              <Text style={styles.multiBadgeText}>{item._count.subOrders} متاجر</Text>
            </View>
          ) : null}
        </View>

        {/* Bottom row: date + price */}
        <View style={styles.cardBottom}>
          <Text style={styles.cardDate}>{dateLabel}</Text>
          {priceValue ? (
            <Text style={styles.cardPrice}>{Number(priceValue).toLocaleString('ar-EG')} ج.م</Text>
          ) : (
            <Text style={styles.cardNoPrice}>قيد التسعير</Text>
          )}
        </View>

        {/* Quick reorder for finished/cancelled orders */}
        {showReorder ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              if (!isReordering) onReorder!(item.id);
            }}
            disabled={isReordering}
            style={({ pressed }) => [
              styles.reorderBtn,
              (pressed || isReordering) && { opacity: 0.85 },
            ]}
          >
            <RotateCcw size={14} color={colors.brand.red} />
            <Text style={styles.reorderText}>
              {isReordering ? 'جاري الإنشاء…' : 'اطلب مرة أخرى'}
            </Text>
          </Pressable>
        ) : null}
      </Pressable>
    </AnimatedListItem>
  );
});

export function OrdersScreen() {
  const [tab, setTab] = useState<TabKey>('current');
  const navigation = useNavigation<Nav>();
  const qc = useQueryClient();

  // Server-side paging, one page per tab. Filtering the whole history on the
  // client only worked while it fitted in a single response — which is why a
  // customer with 58 open orders saw a fraction of them next to a correct total.
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [tab]);

  interface OrdersPage {
    rows: OrderListItem[];
    total: number;
    totalPages: number;
    counts: Record<TabKey, number>;
  }

  const { data, isLoading, refetch, isFetching } = useQuery<OrdersPage>({
    queryKey: ['orders-mine', tab, page],
    queryFn: () =>
      api.raw
        .get('/orders/mine', { params: { group: tab, page, pageSize: PAGE_SIZE } })
        .then((r) => ({
          rows: (r.data?.data ?? []) as OrderListItem[],
          total: Number(r.data?.meta?.pagination?.total ?? 0),
          totalPages: Number(r.data?.meta?.pagination?.totalPages ?? 0),
          counts: (r.data?.meta?.counts ?? {
            current: 0,
            completed: 0,
            cancelled: 0,
          }) as Record<TabKey, number>,
        })),
    // The socket below is the real live channel. This poll is only a safety net
    // for a dropped socket, so it can be slow — it used to run every 20s and
    // duplicate work the socket had already done.
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
    // Keeps the current page on screen while the next one loads.
    placeholderData: (prev) => prev,
  });

  useSocketEvents(SOCKET_EVENTS, () => {
    void qc.invalidateQueries({ queryKey: ['orders-mine'] });
  });

  const filtered = data?.rows ?? [];
  const totalPages = data?.totalPages ?? 0;
  // True totals from the server, not "whatever is on this page".
  const counts: Record<TabKey, number> = data?.counts ?? {
    current: 0,
    completed: 0,
    cancelled: 0,
  };

  const openOrder = (id: string) => navigation.navigate('OrderTracking', { orderId: id });

  // Quick reorder from the list — clones the order and jumps into its tracking
  // screen so the customer sees the new order number immediately.
  const reorderMut = useMutation({
    mutationFn: (id: string) =>
      api.raw
        .post(`/orders/from/${id}`)
        .then((r) => r.data.data as { id: string; orderNumber: string }),
    onSuccess: (newOrder) => {
      showToast({
        title: 'تم إنشاء طلب جديد',
        message: `رقم الطلب: #${newOrder.orderNumber}`,
        tone: 'success',
      });
      void qc.invalidateQueries({ queryKey: ['orders-mine'] });
      navigation.navigate('OrderTracking', { orderId: newOrder.id, justCreated: true });
    },
    onError: (err) =>
      showToast({
        title: 'تعذّر إعادة الطلب',
        message: err instanceof Error ? err.message : 'حصلت مشكلة',
        tone: 'error',
      }),
  });

  // Reorder is only meaningful for finished / cancelled orders; current ones
  // are still being processed.
  const reorderHandler = tab === 'current' ? undefined : (id: string) => reorderMut.mutate(id);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <GradientHeader greeting="طلباتي" location="سجلّ كل طلباتك" hideBack />

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
            <OrderCard
              item={item}
              index={index}
              onPress={openOrder}
              onReorder={reorderHandler}
              reorderingId={reorderMut.isPending ? (reorderMut.variables ?? null) : null}
            />
          )}
          ListFooterComponent={
            totalPages > 1 ? (
              <View style={styles.pager}>
                <Pressable
                  onPress={() => {
                    tickHaptic();
                    setPage((p) => Math.max(1, p - 1));
                  }}
                  disabled={page <= 1 || isFetching}
                  style={[styles.pagerBtn, (page <= 1 || isFetching) && styles.pagerBtnOff]}
                >
                  <Text style={styles.pagerBtnText}>السابق</Text>
                </Pressable>

                <Text style={styles.pagerLabel}>
                  صفحة {page} من {totalPages}
                </Text>

                <Pressable
                  onPress={() => {
                    tickHaptic();
                    setPage((p) => Math.min(totalPages, p + 1));
                  }}
                  disabled={page >= totalPages || isFetching}
                  style={[
                    styles.pagerBtn,
                    (page >= totalPages || isFetching) && styles.pagerBtnOff,
                  ]}
                >
                  <Text style={styles.pagerBtnText}>التالي</Text>
                </Pressable>
              </View>
            ) : null
          }
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
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  pagerBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.brand.red,
    minWidth: 84,
    alignItems: 'center',
  },
  pagerBtnOff: { backgroundColor: colors.line2 },
  pagerBtnText: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  pagerLabel: {
    fontSize: fontSizes.sm,
    color: colors.text.muted,
    fontFamily: fontFamilies.bodyBold,
  },
  // Card — Talabat-style: clean, no chevron, hierarchy by typography weight
  card: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardServiceName: {
    flex: 1,
    fontSize: fontSizes.md,
    color: colors.ink,
    fontFamily: fontFamilies.headingBold,
  },
  cardOrderNumber: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    marginTop: 2,
  },
  multiBadge: {
    marginTop: 2,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: radii.sm,
    backgroundColor: colors.brand.redLight,
  },
  multiBadgeText: {
    fontSize: 10,
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyBold,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  cardDate: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
  },
  cardPrice: {
    fontSize: fontSizes.lg,
    color: colors.brand.red,
    fontFamily: fontFamilies.headingBlack,
  },
  cardNoPrice: {
    fontSize: fontSizes.xs,
    color: colors.warning,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  reorderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.brand.redLight,
    paddingVertical: 10,
    borderRadius: radii.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.brand.red + '30',
  },
  reorderText: {
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xs,
  },
});
