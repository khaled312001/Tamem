import { useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Phone } from 'lucide-react-native';
import { useEffect } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ORDER_STATUS_AR, type OrderStatus } from '@tamem/types';

import { GradientHeader } from '../components/GradientHeader';
import { api } from '../lib/api';
import { connectSocket, subscribeToOrder, unsubscribeFromOrder } from '../lib/socket';
import type { OrdersStackParamList } from '../navigation/OrdersStack';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

type Route = RouteProp<OrdersStackParamList, 'OrderTracking'>;

interface StatusHistoryItem {
  id: string;
  fromStatus?: OrderStatus | null;
  toStatus: OrderStatus;
  reason?: string | null;
  createdAt: string;
  changedByRole: string;
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  category: 'DELIVERY' | 'SHIPPING' | 'MERCHANT';
  notes?: string | null;
  quotedPrice?: string | number | null;
  finalPrice?: string | number | null;
  deliveryAddress?: string | null;
  pickupAddress?: string | null;
  service?: { nameAr: string };
  assignedDriver?: { id: string; name: string; phone: string } | null;
  statusHistory?: StatusHistoryItem[];
  createdAt: string;
}

export function OrderTrackingScreen() {
  const route = useRoute<Route>();
  const qc = useQueryClient();
  const { orderId } = route.params;

  const { data: order, isLoading } = useQuery<OrderDetail>({
    queryKey: ['order', orderId],
    queryFn: () => api.raw.get(`/orders/${orderId}`).then((r) => r.data.data),
  });

  // Realtime: subscribe to this order's room + invalidate on any update
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const s = await connectSocket();
      const refetch = () => {
        if (mounted) qc.invalidateQueries({ queryKey: ['order', orderId] });
      };
      s.on('order:status', refetch);
      await subscribeToOrder(orderId);
      return () => {
        s.off('order:status', refetch);
      };
    })();
    return () => {
      mounted = false;
      void unsubscribeFromOrder(orderId);
    };
  }, [orderId, qc]);

  if (isLoading || !order) {
    return (
      <SafeAreaView style={styles.container}>
        <GradientHeader greeting="جاري التحميل" location="" />
        <ActivityIndicator color={colors.brand.red} style={{ marginTop: spacing.xl }} />
      </SafeAreaView>
    );
  }

  const price = order.finalPrice ?? order.quotedPrice;

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <GradientHeader
        greeting={`طلب #${order.orderNumber}`}
        location={ORDER_STATUS_AR[order.status]}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.statusCard}>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: (colors.status[order.status] ?? colors.brand.red) + '20' },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                { color: colors.status[order.status] ?? colors.brand.red },
              ]}
            >
              {ORDER_STATUS_AR[order.status]}
            </Text>
          </View>
          <Text style={styles.serviceName}>{order.service?.nameAr ?? order.category}</Text>
          {price !== null && price !== undefined && (
            <Text style={styles.price}>{Number(price).toLocaleString('ar-EG')} ج.م</Text>
          )}
        </View>

        {order.assignedDriver && (
          <View style={styles.driverCard}>
            <Text style={styles.sectionTitle}>السائق</Text>
            <View style={styles.driverRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {order.assignedDriver.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.driverName}>{order.assignedDriver.name}</Text>
                <Text style={styles.driverPhone}>{order.assignedDriver.phone}</Text>
              </View>
              <Pressable
                onPress={() => Linking.openURL(`tel:${order.assignedDriver!.phone}`)}
                style={styles.callBtn}
              >
                <Phone size={16} color={colors.white} />
                <Text style={styles.callBtnText}>اتصال</Text>
              </Pressable>
            </View>
          </View>
        )}

        {(order.pickupAddress || order.deliveryAddress) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>المسار</Text>
            {order.pickupAddress && (
              <View style={styles.row}>
                <Text style={styles.label}>الاستلام</Text>
                <Text style={styles.value}>{order.pickupAddress}</Text>
              </View>
            )}
            {order.deliveryAddress && (
              <View style={styles.row}>
                <Text style={styles.label}>التوصيل</Text>
                <Text style={styles.value}>{order.deliveryAddress}</Text>
              </View>
            )}
          </View>
        )}

        {order.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>تفاصيل الطلب</Text>
            <Text style={styles.notes}>{order.notes}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>السجل</Text>
          {(order.statusHistory ?? []).map((h) => (
            <View key={h.id} style={styles.historyItem}>
              <View
                style={[
                  styles.historyDot,
                  { backgroundColor: colors.status[h.toStatus] ?? colors.brand.red },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.historyTitle}>{ORDER_STATUS_AR[h.toStatus]}</Text>
                {h.reason && <Text style={styles.historyReason}>{h.reason}</Text>}
                <Text style={styles.historyTime}>
                  {new Date(h.createdAt).toLocaleString('ar-EG')}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg },
  statusCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
  },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
  statusText: { fontFamily: fontFamilies.bodyExtraBold, fontSize: fontSizes.sm },
  serviceName: {
    fontFamily: fontFamilies.headingBold,
    color: colors.ink,
    fontSize: fontSizes.md,
  },
  price: { fontFamily: fontFamilies.headingBlack, fontSize: fontSizes.xl, color: colors.brand.red },
  driverCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brand.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontFamily: fontFamilies.headingBold, fontSize: fontSizes.md },
  driverName: { fontFamily: fontFamilies.bodyExtraBold, color: colors.ink, fontSize: fontSizes.sm },
  driverPhone: { fontFamily: fontFamilies.body, color: colors.text.muted, fontSize: fontSizes.xs },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.brand.red,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  callBtnText: {
    color: colors.white,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xs,
  },
  section: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sectionTitle: {
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.text.muted,
    fontSize: fontSizes.xs,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs },
  label: {
    color: colors.text.muted,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
    width: 60,
  },
  value: {
    flex: 1,
    fontFamily: fontFamilies.body,
    color: colors.text.primary,
    fontSize: fontSizes.sm,
  },
  notes: {
    fontFamily: fontFamilies.body,
    color: colors.text.primary,
    fontSize: fontSizes.sm,
    lineHeight: 22,
  },
  historyItem: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    alignItems: 'flex-start',
  },
  historyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  historyTitle: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
    color: colors.ink,
  },
  historyReason: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    marginTop: 2,
  },
  historyTime: {
    fontFamily: fontFamilies.body,
    fontSize: 10,
    color: colors.text.muted,
    marginTop: 2,
  },
});
