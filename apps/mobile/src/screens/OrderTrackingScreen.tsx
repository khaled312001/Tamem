import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, MessageCircle, Phone, RotateCcw, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
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

const SUPPORT_WHATSAPP =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_TAMEM_WHATSAPP) || '+201010254819';

interface DriverLocation {
  lat: number;
  lng: number;
  at: string;
}

export function OrderTrackingScreen() {
  const route = useRoute<Route>();
  const qc = useQueryClient();
  const { orderId, justCreated } = route.params;
  const [showWaBanner, setShowWaBanner] = useState(!!justCreated);
  const [driverLoc, setDriverLoc] = useState<DriverLocation | null>(null);

  const openWhatsApp = (msg: string) => {
    const num = SUPPORT_WHATSAPP.replace(/\D/g, '');
    const url = `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
    if (Platform.OS === 'web') window.open(url, '_blank');
    else void Linking.openURL(url);
  };

  const {
    data: order,
    isLoading,
    refetch,
    isFetching,
  } = useQuery<OrderDetail>({
    queryKey: ['order', orderId],
    queryFn: () => api.raw.get(`/orders/${orderId}`).then((r) => r.data.data),
  });

  // Realtime: subscribe to this order's room. order:status invalidates the
  // query so any field changes are picked up; driver:location updates the
  // local "last seen" indicator without re-fetching.
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const s = await connectSocket();
      const refetch = () => {
        if (mounted) qc.invalidateQueries({ queryKey: ['order', orderId] });
      };
      const onLoc = (msg: { orderId?: string; lat: number; lng: number; at: string }) => {
        if (msg.orderId === orderId || !msg.orderId) {
          setDriverLoc({ lat: msg.lat, lng: msg.lng, at: msg.at });
        }
      };
      s.on('order:status', refetch);
      s.on('driver:location', onLoc);
      await subscribeToOrder(orderId);
      return () => {
        s.off('order:status', refetch);
        s.off('driver:location', onLoc);
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

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={() => refetch()}
            tintColor={colors.brand.red}
            colors={[colors.brand.red]}
          />
        }
      >
        {showWaBanner && (
          <View style={styles.waBanner}>
            <View style={styles.waIconWrap}>
              <CheckCircle2 size={22} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.waTitle}>تم استلام طلبك بنجاح</Text>
              <Text style={styles.waBody}>
                هنبعتلك تأكيد فوري على واتساب بكل التفاصيل بمجرد ما الإدارة تراجع الطلب وتسعّره.
              </Text>
            </View>
            <Pressable onPress={() => setShowWaBanner(false)} style={styles.waClose} hitSlop={8}>
              <X size={16} color={colors.white} />
            </Pressable>
          </View>
        )}

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

        {/* Status progress bar — shows the 7-stage happy path with the current
            stage highlighted. Cancelled/Rejected orders skip this and show a
            terminal indicator instead. */}
        <OrderStageProgress status={order.status} />

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
                {driverLoc && <DriverLastSeen at={driverLoc.at} />}
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

        {/* Reorder — clones this order's content into a brand new NEW order.
            Only useful once the original has reached a terminal state. */}
        {['COMPLETED', 'DELIVERED', 'CANCELLED'].includes(order.status) && (
          <ReorderButton orderId={order.id} orderNumber={order.orderNumber} />
        )}

        {/* تواصل مع الإدارة — WhatsApp deep-link with order context */}
        <Pressable
          onPress={() =>
            openWhatsApp(
              `استفسار عن طلب ${order.orderNumber}${price ? ` (${Number(price).toLocaleString('ar-EG')} ج.م)` : ''} — الحالة: ${ORDER_STATUS_AR[order.status]}`,
            )
          }
          style={({ pressed }) => [styles.contactBtn, pressed && { opacity: 0.85 }]}
        >
          <MessageCircle size={18} color={colors.white} />
          <Text style={styles.contactBtnText}>تواصل مع الإدارة</Text>
        </Pressable>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Driver "last seen" indicator — re-renders every 10s with relative timeago.
// ────────────────────────────────────────────────────────────────────────────

function DriverLastSeen({ at }: { at: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(at).getTime()) / 1000));
  const label =
    seconds < 60
      ? 'الآن'
      : seconds < 3600
        ? `منذ ${Math.floor(seconds / 60)} د`
        : `منذ ${Math.floor(seconds / 3600)} س`;
  const fresh = seconds < 90;
  return (
    <Text
      style={{
        fontSize: 10,
        marginTop: 2,
        color: fresh ? colors.success : colors.text.muted,
        fontFamily: fontFamilies.bodyBold,
      }}
    >
      📍 آخر موقع: {label}
    </Text>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Progress bar + Reorder helpers
// ────────────────────────────────────────────────────────────────────────────

const STAGE_ORDER: OrderStatus[] = [
  'NEW',
  'UNDER_REVIEW',
  'PRICED',
  'ACCEPTED',
  'DRIVER_ASSIGNED',
  'IN_ROUTE',
  'DELIVERED',
];
const STAGE_LABEL: Record<OrderStatus, string> = {
  NEW: 'استلمنا',
  UNDER_REVIEW: 'مراجعة',
  PRICED: 'تسعير',
  AWAITING_CUSTOMER_APPROVAL: 'موافقة',
  ACCEPTED: 'تأكيد',
  DRIVER_ASSIGNED: 'سائق',
  PICKED_UP: 'استلام',
  IN_ROUTE: 'الطريق',
  DELIVERED: 'سُلِّم',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي',
  REJECTED: 'مرفوض',
};

function OrderStageProgress({ status }: { status: OrderStatus }) {
  if (status === 'CANCELLED' || status === 'REJECTED') {
    return (
      <View style={progressStyles.terminal}>
        <Text style={progressStyles.terminalText}>
          {status === 'CANCELLED' ? '🚫 تم إلغاء الطلب' : '❌ تم رفض الطلب'}
        </Text>
      </View>
    );
  }
  // Treat AWAITING_CUSTOMER_APPROVAL as still on the "PRICED" stage,
  // PICKED_UP as same group as DRIVER_ASSIGNED, COMPLETED as DELIVERED+1.
  const aliasMap: Partial<Record<OrderStatus, OrderStatus>> = {
    AWAITING_CUSTOMER_APPROVAL: 'PRICED',
    PICKED_UP: 'DRIVER_ASSIGNED',
    COMPLETED: 'DELIVERED',
  };
  const effective = aliasMap[status] ?? status;
  const currentIdx = Math.max(0, STAGE_ORDER.indexOf(effective));
  return (
    <View style={progressStyles.row}>
      {STAGE_ORDER.map((stage, i) => {
        const done = i < currentIdx;
        const current = i === currentIdx;
        return (
          <View key={stage} style={progressStyles.stage}>
            <View style={progressStyles.dotRow}>
              {i > 0 && (
                <View
                  style={[
                    progressStyles.line,
                    (done || current) && { backgroundColor: colors.brand.red },
                  ]}
                />
              )}
              <View
                style={[
                  progressStyles.dot,
                  done && progressStyles.dotDone,
                  current && progressStyles.dotCurrent,
                ]}
              />
              {i < STAGE_ORDER.length - 1 && (
                <View
                  style={[progressStyles.line, done && { backgroundColor: colors.brand.red }]}
                />
              )}
            </View>
            <Text
              style={[
                progressStyles.label,
                (done || current) && {
                  color: colors.brand.red,
                  fontFamily: fontFamilies.bodyExtraBold,
                },
              ]}
              numberOfLines={1}
            >
              {STAGE_LABEL[stage]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function ReorderButton({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const navigation =
    useNavigation<NativeStackNavigationProp<OrdersStackParamList, 'OrderTracking'>>();
  const reorderMut = useMutation({
    mutationFn: () =>
      api.raw
        .post(`/orders/from/${orderId}`)
        .then((r) => r.data.data as { id: string; orderNumber: string }),
    onSuccess: (newOrder) => {
      // replace so the back button goes to the orders list, not the old order
      navigation.replace('OrderTracking', { orderId: newOrder.id, justCreated: true });
    },
    onError: (err) => Alert.alert('خطأ', err instanceof Error ? err.message : 'فشل إعادة الطلب'),
  });
  return (
    <Pressable
      onPress={() => reorderMut.mutate()}
      disabled={reorderMut.isPending}
      style={({ pressed }) => [
        progressStyles.reorderBtn,
        pressed && { opacity: 0.85 },
        reorderMut.isPending && { opacity: 0.6 },
      ]}
    >
      {reorderMut.isPending ? (
        <ActivityIndicator size="small" color={colors.brand.red} />
      ) : (
        <>
          <RotateCcw size={16} color={colors.brand.red} />
          <Text style={progressStyles.reorderText}>اطلب نفس الطلب مرة أخرى</Text>
          <Text style={progressStyles.reorderSubtext}>{orderNumber}</Text>
        </>
      )}
    </Pressable>
  );
}

const progressStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: spacing.md,
  },
  stage: { flex: 1, alignItems: 'center' },
  dotRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  line: { flex: 1, height: 2, backgroundColor: colors.line2 },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.line2,
    borderWidth: 2,
    borderColor: colors.white,
  },
  dotDone: { backgroundColor: colors.brand.red },
  dotCurrent: {
    backgroundColor: colors.brand.red,
    transform: [{ scale: 1.4 }],
  },
  label: {
    fontSize: 10,
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    marginTop: 4,
    textAlign: 'center',
  },
  terminal: {
    backgroundColor: colors.soft,
    padding: spacing.md,
    borderRadius: radii.lg,
    marginTop: spacing.md,
    alignItems: 'center',
  },
  terminalText: {
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.text.muted,
    fontSize: fontSizes.sm,
  },
  reorderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand.redLight,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.brand.red,
  },
  reorderText: {
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
  },
  reorderSubtext: {
    color: colors.brand.red,
    opacity: 0.7,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
  },
});

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
  // WhatsApp confirmation banner (justCreated)
  waBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: '#1A9F6E',
    padding: spacing.md,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
  },
  waIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waTitle: {
    color: colors.white,
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.sm,
    marginBottom: 2,
  },
  waBody: {
    color: 'rgba(255,255,255,0.9)',
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    lineHeight: 18,
  },
  waClose: {
    padding: 4,
  },
  // Contact admin CTA
  contactBtn: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: '#25D366',
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    boxShadow: '0 8px 20px rgba(37,211,102,0.30)',
    elevation: 6,
  },
  contactBtnText: {
    color: colors.white,
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.sm,
  },
});
