import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  CheckCheck,
  ClipboardCheck,
  Clock,
  CreditCard,
  FileSearch,
  HandCoins,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Receipt,
  RotateCcw,
  ShieldCheck,
  Star,
  Truck,
  UserCheck,
  X as XIcon,
} from 'lucide-react-native';
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
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ORDER_STATUS_AR, type OrderStatus } from '@tamem/types';

import { ScreenHeader } from '../components/ScreenHeader';
import {
  EmptyState,
  GhostButton,
  OrderTimeline,
  type TimelineStage,
  PrimaryButton,
  SecondaryButton,
  StatusPill,
} from '../components/ui';
import { api } from '../lib/api';
import { connectSocket, subscribeToOrder, unsubscribeFromOrder } from '../lib/socket';
import type { OrdersStackParamList } from '../navigation/OrdersStack';
import { colors, fontFamilies, fontSizes, radii, shadows, spacing } from '../theme/tokens';

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
  paymentStatus?: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | null;
  deliveryAddress?: string | null;
  pickupAddress?: string | null;
  service?: { nameAr: string };
  assignedDriver?: { id: string; name: string; phone: string } | null;
  statusHistory?: StatusHistoryItem[];
  createdAt: string;
  scheduledFor?: string | null;
  review?: { id: string; rating: number; comment?: string | null } | null;
  /** Multi-merchant child orders. Populated only when this is a parent. */
  subOrders?: Array<{
    id: string;
    orderNumber: string;
    status: OrderStatus;
    merchantId: string | null;
    merchantSubtotal: string | number | null;
    quotedPrice?: string | number | null;
    items: Array<{ productNameSnapshot: string; quantity: number }>;
  }>;
}

const SUPPORT_WHATSAPP =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_TAMEM_WHATSAPP) || '+201010254819';

interface DriverLocation {
  lat: number;
  lng: number;
  at: string;
}

/**
 * Visible order phases (4 stages) — collapses the backend's 12-state FSM
 * into 4 buckets the customer cares about. Reduces cognitive load on the
 * tracking screen + matches the simpler admin workflow in the dashboard.
 *
 *   1. ORDER_PLACED   ← NEW + UNDER_REVIEW
 *   2. CONFIRMED      ← PRICED + AWAITING_CUSTOMER_APPROVAL + ACCEPTED
 *   3. ON_THE_WAY     ← DRIVER_ASSIGNED + PICKED_UP + IN_ROUTE
 *   4. DELIVERED      ← DELIVERED + COMPLETED
 *
 * The backend FSM and OrderStatusHistory stay unchanged — phase mapping
 * is purely a presentation concern, so audit trails remain granular.
 */
type PhaseKey = 'ORDER_PLACED' | 'CONFIRMED' | 'ON_THE_WAY' | 'DELIVERED';

interface PhaseDef {
  key: PhaseKey;
  /** Backend statuses that map to this phase. The FIRST one reached wins
   *  as the phase's completedAt timestamp. */
  statuses: OrderStatus[];
  label: string;
  description: string;
  Icon: typeof CheckCircle2;
}

const PHASE_DEFS: PhaseDef[] = [
  {
    key: 'ORDER_PLACED',
    statuses: ['NEW', 'UNDER_REVIEW'],
    label: 'تم استلام طلبك',
    description: 'وصلنا الطلب ونحن نراجع التفاصيل.',
    Icon: ClipboardCheck,
  },
  {
    key: 'CONFIRMED',
    statuses: ['PRICED', 'AWAITING_CUSTOMER_APPROVAL', 'ACCEPTED'],
    label: 'تم التأكيد والتسعير',
    description: 'تم تأكيد الطلب. السائق هيتعيّن خلال دقائق.',
    Icon: CheckCircle2,
  },
  {
    key: 'ON_THE_WAY',
    statuses: ['DRIVER_ASSIGNED', 'PICKED_UP', 'IN_ROUTE'],
    label: 'في الطريق إليك',
    description: 'السائق في الطريق. هتلاقيه عندك قريب.',
    Icon: Truck,
  },
  {
    key: 'DELIVERED',
    statuses: ['DELIVERED', 'COMPLETED'],
    label: 'تم التسليم',
    description: 'تم تسليم الطلب بنجاح. شكراً لك.',
    Icon: CheckCheck,
  },
];

const STATUS_TO_PHASE: Partial<Record<OrderStatus, PhaseKey>> = (() => {
  const map: Partial<Record<OrderStatus, PhaseKey>> = {};
  for (const p of PHASE_DEFS) for (const s of p.statuses) map[s] = p.key;
  return map;
})();

function currentPhaseKey(status: OrderStatus): PhaseKey {
  return STATUS_TO_PHASE[status] ?? 'ORDER_PLACED';
}

/** Per-status copy still kept so the headline + hint feel granular even
 *  though the timeline only shows 4 bullets. */
const STAGE_LABEL: Record<OrderStatus, string> = {
  NEW: 'تم استلام الطلب',
  UNDER_REVIEW: 'قيد المراجعة',
  PRICED: 'تم التسعير',
  AWAITING_CUSTOMER_APPROVAL: 'قيد المعالجة',
  ACCEPTED: 'تم التأكيد',
  DRIVER_ASSIGNED: 'تعيين سائق',
  PICKED_UP: 'تم استلام الطلب من المتجر',
  IN_ROUTE: 'في الطريق إليك',
  DELIVERED: 'تم التسليم',
  COMPLETED: 'مكتمل',
  CANCELLED: 'تم الإلغاء',
  REJECTED: 'تم الرفض',
};

const STAGE_HINT: Partial<Record<OrderStatus, string>> = {
  NEW: 'وصلك إشعار التأكيد. هنبدأ المراجعة فوراً.',
  UNDER_REVIEW: 'فريقنا بيراجع تفاصيل الطلب. خلال دقائق هنبعت لك السعر.',
  PRICED: 'تم تسعير الطلب. شوف التفاصيل وأكّد للبدء.',
  AWAITING_CUSTOMER_APPROVAL: 'بنتأكد من التفاصيل، هنبدأ التنفيذ قريباً.',
  ACCEPTED: 'تم تأكيد الطلب. السائق هيتعيّن خلال دقايق.',
  DRIVER_ASSIGNED: 'السائق في طريقه لاستلام الطلب.',
  PICKED_UP: 'الطلب مع السائق ومتجه إليك.',
  IN_ROUTE: 'الطلب في الطريق. هتلاقيه عندك قريب.',
  DELIVERED: 'تم تسليم الطلب بنجاح.',
  COMPLETED: 'الطلب مكتمل. شكراً لك.',
};

const CATEGORY_LABEL = {
  DELIVERY: 'دليفري داخل المدينة',
  SHIPPING: 'شحن بين المحافظات',
  MERCHANT: 'طلب تاجر',
} as const;

const TERMINAL_BAD: OrderStatus[] = ['CANCELLED', 'REJECTED'];

// Customer can only self-cancel before pricing kicks in. Once the admin has
// quoted a price the cancellation has to go through them — they've already
// done the discovery/sourcing work, and PRICED orders may have committed
// inventory.
const CUSTOMER_CANCELLABLE: OrderStatus[] = ['NEW', 'UNDER_REVIEW'];

// Statuses where the customer THINKS they can still cancel but actually
// need admin approval. We surface an explanatory banner instead of silently
// hiding the cancel button.
const CANCEL_LOCKED_BUT_ACTIVE: OrderStatus[] = [
  'PRICED',
  'AWAITING_CUSTOMER_APPROVAL',
  'ACCEPTED',
  'DRIVER_ASSIGNED',
  'PICKED_UP',
  'IN_ROUTE',
];

/** Mask middle digits of a phone for display, e.g. 01010254819 → 010 *** 4819. */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return phone;
  return `${digits.slice(0, 3)} *** ${digits.slice(-4)}`;
}

const COMPLAINT_REASONS = [
  'السائق لم يحضر',
  'تأخّر طويل في التوصيل',
  'الطلب وصل تالف أو ناقص',
  'تعامل غير لائق',
  'مشكلة في السعر / الفاتورة',
  'سبب آخر',
] as const;

export function OrderTrackingScreen() {
  const route = useRoute<Route>();
  const navigation =
    useNavigation<NativeStackNavigationProp<OrdersStackParamList, 'OrderTracking'>>();
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
    error,
    refetch,
    isFetching,
  } = useQuery<OrderDetail>({
    queryKey: ['order', orderId],
    queryFn: () => api.raw.get(`/orders/${orderId}`).then((r) => r.data.data),
    enabled: !!orderId,
  });

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const s = await connectSocket();
      const refetchLocal = () => {
        if (mounted) qc.invalidateQueries({ queryKey: ['order', orderId] });
      };
      const onLoc = (msg: { orderId?: string; lat: number; lng: number; at: string }) => {
        if (msg.orderId === orderId || !msg.orderId) {
          setDriverLoc({ lat: msg.lat, lng: msg.lng, at: msg.at });
        }
      };
      s.on('order:status', refetchLocal);
      s.on('driver:location', onLoc);
      await subscribeToOrder(orderId);
      return () => {
        s.off('order:status', refetchLocal);
        s.off('driver:location', onLoc);
      };
    })();
    return () => {
      mounted = false;
      void unsubscribeFromOrder(orderId);
    };
  }, [orderId, qc]);

  if (isLoading) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScreenHeader title="تتبع الطلب" />
        <ActivityIndicator color={colors.brand.red} style={{ marginTop: spacing.xxl }} />
      </SafeAreaView>
    );
  }

  if (error || !order) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScreenHeader title="تتبع الطلب" />
        <EmptyState
          icon={<AlertCircle size={36} color={colors.danger} />}
          title="تعذّر تحميل الطلب"
          subtitle={error instanceof Error ? error.message : 'حدث خطأ غير متوقع'}
          actionLabel="إعادة المحاولة"
          onAction={() => refetch()}
        />
      </SafeAreaView>
    );
  }

  const price = order.finalPrice ?? order.quotedPrice;
  const isTerminalBad = TERMINAL_BAD.includes(order.status);
  const isCompleted = order.status === 'COMPLETED' || order.status === 'DELIVERED';
  const canCustomerCancel = CUSTOMER_CANCELLABLE.includes(order.status);
  const cancelLocked = CANCEL_LOCKED_BUT_ACTIVE.includes(order.status);
  const stageHint = STAGE_HINT[order.status];

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader title={`طلب #${order.orderNumber}`} subtitle={CATEGORY_LABEL[order.category]} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={() => refetch()}
            tintColor={colors.brand.red}
          />
        }
      >
        {/* ─────── Just-created confirmation banner ─────── */}
        {showWaBanner && (
          <View style={[styles.waBanner, shadows.sm]}>
            <View style={styles.waIconWrap}>
              <CheckCircle2 size={20} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.waTitle}>تم استلام طلبك بنجاح</Text>
              <Text style={styles.waBody}>هنبعت لك تأكيد على واتساب وبنبدأ المراجعة فوراً.</Text>
            </View>
            <Pressable onPress={() => setShowWaBanner(false)} style={styles.waClose} hitSlop={8}>
              <XIcon size={14} color={colors.white} />
            </Pressable>
          </View>
        )}

        {/* ─────── Hero status card ─────── */}
        <View style={[styles.statusCard, shadows.md]}>
          <View style={styles.statusHeader}>
            <StatusPill
              label={ORDER_STATUS_AR[order.status]}
              color={colors.status[order.status]}
              dot
            />
            <View style={styles.statusEtaRow}>
              <Clock size={14} color={colors.text.muted} />
              <Text style={styles.statusEtaText}>
                {new Date(order.createdAt).toLocaleString('ar-EG')}
              </Text>
            </View>
          </View>
          <Text style={styles.statusHeadline}>
            {STAGE_LABEL[order.status] ?? ORDER_STATUS_AR[order.status]}
          </Text>
          {stageHint ? <Text style={styles.statusHint}>{stageHint}</Text> : null}

          {/* Scheduled-for indicator — only when the customer requested a
              future delivery window AND the order is still pre-dispatch. */}
          {order.scheduledFor &&
          (order.status === 'NEW' ||
            order.status === 'UNDER_REVIEW' ||
            order.status === 'PRICED' ||
            order.status === 'AWAITING_CUSTOMER_APPROVAL' ||
            order.status === 'ACCEPTED') ? (
            <View style={styles.scheduledBanner}>
              <Clock size={14} color={colors.brand.gold} />
              <Text style={styles.scheduledBannerText}>
                مجدول لـ{' '}
                {new Date(order.scheduledFor).toLocaleString('ar-EG', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          ) : null}
          <View style={styles.statusFooter}>
            <View style={{ flex: 1 }}>
              <Text style={styles.statusFooterLabel}>السعر</Text>
              {price !== null && price !== undefined ? (
                <Text style={styles.statusFooterValue}>
                  {Number(price).toLocaleString('ar-EG')} ج.م
                </Text>
              ) : (
                <Text style={styles.statusFooterPending}>قيد التسعير</Text>
              )}
            </View>
            {order.service?.nameAr ? (
              <View>
                <Text style={styles.statusFooterLabel}>الخدمة</Text>
                <Text style={styles.statusFooterService}>{order.service.nameAr}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* ─────── Pay-online CTA — only when the order is priced and unpaid. ───────
            Lets the customer settle the bill via Paymob (Vodafone Cash / InstaPay)
            instead of paying the driver in cash on delivery. */}
        {(order.status === 'PRICED' || order.status === 'AWAITING_CUSTOMER_APPROVAL') &&
          order.paymentStatus !== 'PAID' &&
          price != null && <PayOnlineCTA orderId={order.id} amount={Number(price)} />}

        {/* ─────── Multi-merchant sub-orders breakdown ─────── */}
        {order.subOrders && order.subOrders.length > 0 ? (
          <View style={[styles.section, shadows.sm]}>
            <Text style={styles.sectionTitle}>تفاصيل المتاجر ({order.subOrders.length})</Text>
            <Text style={styles.subOrderHint}>
              طلبك انقسم لكذا متجر — كل متجر له سائق ومسار منفصل، الإجمالي والدفع موحّدين.
            </Text>
            {order.subOrders.map((sub) => (
              <Pressable
                key={sub.id}
                onPress={() => navigation.push('OrderTracking', { orderId: sub.id })}
                style={({ pressed }) => [styles.subOrderRow, pressed && { opacity: 0.85 }]}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.subOrderNum}>#{sub.orderNumber}</Text>
                  <Text style={styles.subOrderItems} numberOfLines={2}>
                    {sub.items.map((i) => `${i.productNameSnapshot} × ${i.quantity}`).join(' · ')}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={styles.subOrderPrice}>
                    {(sub.merchantSubtotal ?? sub.quotedPrice)
                      ? `${Number(sub.merchantSubtotal ?? sub.quotedPrice).toLocaleString('ar-EG')} ج.م`
                      : '—'}
                  </Text>
                  <View style={styles.subOrderStatusPill}>
                    <Text style={styles.subOrderStatusText}>
                      {STAGE_LABEL[sub.status] ?? sub.status}
                    </Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* ─────── Vertical stage timeline (more RTL-resilient than horizontal) ─────── */}
        {!isTerminalBad && (
          <View style={[styles.section, shadows.sm]}>
            <Text style={styles.sectionTitle}>مراحل الطلب</Text>
            <OrderTimeline
              stages={buildStages(order.statusHistory)}
              currentStage={currentPhaseKey(order.status)}
            />
          </View>
        )}

        {isTerminalBad && (
          <View style={[styles.terminalCard, shadows.sm]}>
            <XIcon size={22} color={colors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={styles.terminalTitle}>
                {order.status === 'CANCELLED' ? 'تم إلغاء الطلب' : 'تم رفض الطلب'}
              </Text>
              <Text style={styles.terminalSub}>
                لو محتاج توضيح، تقدر تتواصل مع الإدارة عبر واتساب من زر التواصل بالأسفل.
              </Text>
            </View>
          </View>
        )}

        {/* ─────── Driver card ─────── */}
        {order.assignedDriver && (
          <View style={[styles.section, shadows.sm]}>
            <Text style={styles.sectionTitle}>السائق</Text>
            <View style={styles.driverRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {order.assignedDriver.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.driverName}>{order.assignedDriver.name}</Text>
                <Text style={styles.driverPhone}>
                  {/* Mask middle digits for privacy until backend exposes proxy. */}
                  {maskPhone(order.assignedDriver.phone)}
                </Text>
                {driverLoc && <DriverLastSeen at={driverLoc.at} />}
              </View>
            </View>
            <View style={styles.driverActionsRow}>
              <Pressable
                onPress={() => Linking.openURL(`tel:${order.assignedDriver!.phone}`)}
                style={({ pressed }) => [styles.driverActionBtn, pressed && { opacity: 0.85 }]}
                accessibilityLabel="اتصال بالسائق"
              >
                <Phone size={14} color={colors.white} />
                <Text style={styles.driverActionText}>اتصال</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  Linking.openURL(`https://wa.me/${order.assignedDriver!.phone.replace(/\D/g, '')}`)
                }
                style={({ pressed }) => [
                  styles.driverActionBtn,
                  styles.driverActionWa,
                  pressed && { opacity: 0.85 },
                ]}
                accessibilityLabel="واتساب السائق"
              >
                <MessageCircle size={14} color={colors.white} />
                <Text style={styles.driverActionText}>واتساب</Text>
              </Pressable>
              <Pressable
                onPress={() => Linking.openURL(`sms:${order.assignedDriver!.phone}`)}
                style={({ pressed }) => [
                  styles.driverActionBtn,
                  styles.driverActionSms,
                  pressed && { opacity: 0.85 },
                ]}
                accessibilityLabel="رسالة للسائق"
              >
                <MessageCircle size={14} color={colors.brand.red} />
                <Text style={[styles.driverActionText, { color: colors.brand.red }]}>رسالة</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ─────── Route ─────── */}
        {(order.pickupAddress || order.deliveryAddress) && (
          <View style={[styles.section, shadows.sm]}>
            <Text style={styles.sectionTitle}>المسار</Text>
            {order.pickupAddress ? (
              <View style={styles.routeRow}>
                <View style={[styles.routeDot, { backgroundColor: colors.success }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.routeLabel}>الاستلام من</Text>
                  <Text style={styles.routeAddress}>{order.pickupAddress}</Text>
                </View>
                <MapPin size={16} color={colors.text.muted} />
              </View>
            ) : null}
            {order.pickupAddress && order.deliveryAddress ? (
              <View style={styles.routeConnector} />
            ) : null}
            {order.deliveryAddress ? (
              <View style={styles.routeRow}>
                <View style={[styles.routeDot, { backgroundColor: colors.brand.red }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.routeLabel}>التوصيل إلى</Text>
                  <Text style={styles.routeAddress}>{order.deliveryAddress}</Text>
                </View>
                <MapPin size={16} color={colors.text.muted} />
              </View>
            ) : null}
          </View>
        )}

        {/* ─────── Order notes ─────── */}
        {order.notes ? (
          <View style={[styles.section, shadows.sm]}>
            <View style={styles.sectionTitleRow}>
              <Receipt size={16} color={colors.text.secondary} />
              <Text style={styles.sectionTitle}>تفاصيل الطلب</Text>
            </View>
            <Text style={styles.notesText}>{order.notes}</Text>
          </View>
        ) : null}

        {/* ─────── Activity log ─────── */}
        {Array.isArray(order.statusHistory) && order.statusHistory.length > 0 ? (
          <View style={[styles.section, shadows.sm]}>
            <Text style={styles.sectionTitle}>سجل النشاط</Text>
            {order.statusHistory.map((h, i) => (
              <View key={h.id} style={styles.logRow}>
                <View style={styles.logDotCol}>
                  <View
                    style={[
                      styles.logDot,
                      { backgroundColor: colors.status[h.toStatus] ?? colors.brand.red },
                    ]}
                  />
                  {i < order.statusHistory!.length - 1 ? (
                    <View style={styles.logConnector} />
                  ) : null}
                </View>
                <View style={{ flex: 1, paddingBottom: spacing.md }}>
                  <Text style={styles.logTitle}>{ORDER_STATUS_AR[h.toStatus]}</Text>
                  {h.reason ? <Text style={styles.logReason}>{h.reason}</Text> : null}
                  <Text style={styles.logTime}>
                    {new Date(h.createdAt).toLocaleString('ar-EG')}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* ─────── Review prompt ─────── */}
        {isCompleted ? (
          <ReviewPrompt
            orderId={order.id}
            hasDriver={!!order.assignedDriver}
            existingReview={order.review ?? null}
          />
        ) : null}

        {/* ─────── Footer actions ─────── */}
        <View style={styles.actions}>
          {(isCompleted || isTerminalBad) && (
            <View style={{ marginBottom: spacing.md }}>
              <ReorderButton orderId={order.id} orderNumber={order.orderNumber} />
            </View>
          )}

          {/* Receipt — visible after delivery so the customer has a printable
              trail. Used to import Receipt icon without ever rendering it. */}
          {isCompleted ? (
            <View style={{ marginBottom: spacing.md }}>
              <GhostButton
                label="إيصال الطلب"
                Icon={Receipt}
                onPress={() => {
                  const lines = [
                    `إيصال طلب #${order.orderNumber}`,
                    `الخدمة: ${order.service?.nameAr ?? '—'}`,
                    `السعر: ${price ? `${Number(price).toLocaleString('ar-EG')} ج.م` : '—'}`,
                    order.deliveryAddress ? `العنوان: ${order.deliveryAddress}` : null,
                    order.assignedDriver ? `السائق: ${order.assignedDriver.name}` : null,
                    `التاريخ: ${new Date(order.createdAt).toLocaleString('ar-EG')}`,
                  ]
                    .filter(Boolean)
                    .join('\n');
                  Alert.alert('إيصال الطلب', lines, [
                    {
                      text: 'مشاركة عبر واتساب',
                      onPress: () => openWhatsApp(lines),
                    },
                    { text: 'إغلاق', style: 'cancel' },
                  ]);
                }}
              />
            </View>
          ) : null}

          <SecondaryButton
            label="تواصل مع الإدارة"
            Icon={MessageCircle}
            onPress={() =>
              openWhatsApp(
                `استفسار عن طلب ${order.orderNumber}${price ? ` (${Number(price).toLocaleString('ar-EG')} ج.م)` : ''} — الحالة: ${ORDER_STATUS_AR[order.status]}`,
              )
            }
          />

          {/* Complaint — categorized + escalates to admin with context. */}
          {!isTerminalBad ? (
            <View style={{ marginTop: spacing.md }}>
              <GhostButton
                label="الإبلاغ عن مشكلة"
                Icon={AlertCircle}
                tone="danger"
                onPress={() => {
                  // Use an action sheet of categorized reasons.
                  Alert.alert('الإبلاغ عن مشكلة', 'اختر سبب المشكلة وهنتواصل معاك خلال 15 دقيقة:', [
                    ...COMPLAINT_REASONS.map((r) => ({
                      text: r,
                      onPress: () =>
                        openWhatsApp(
                          `🚨 إبلاغ عن مشكلة في طلب #${order.orderNumber}\nالسبب: ${r}\nالحالة: ${ORDER_STATUS_AR[order.status]}`,
                        ),
                    })),
                    { text: 'إلغاء', style: 'cancel' as const },
                  ]);
                }}
              />
            </View>
          ) : null}

          {canCustomerCancel ? (
            <View style={{ marginTop: spacing.md }}>
              <CancelOrderButton orderId={order.id} orderNumber={order.orderNumber} />
            </View>
          ) : cancelLocked ? (
            <View style={{ marginTop: spacing.md }}>
              <View style={styles.cancelLockedNote}>
                <ShieldCheck size={14} color={colors.warning} />
                <Text style={styles.cancelLockedText}>
                  الطلب اتسعّر، الإلغاء بقى محتاج موافقة الإدارة (قد يترتب عليه رسوم).
                </Text>
              </View>
              <View style={{ marginTop: spacing.sm }}>
                <GhostButton
                  label="طلب إلغاء (يحتاج موافقة الإدارة)"
                  tone="danger"
                  onPress={() => {
                    Alert.alert(
                      'طلب إلغاء',
                      `إلغاء طلب #${order.orderNumber} بعد التسعير قد يرتب عليك رسوم تحضير أو رسوم سائق. الإدارة هتراجع وترد عليك. تأكيد؟`,
                      [
                        { text: 'تراجع', style: 'cancel' },
                        {
                          text: 'أرسل طلب الإلغاء',
                          style: 'destructive',
                          onPress: () =>
                            openWhatsApp(
                              `طلب إلغاء — طلب #${order.orderNumber}\nالحالة: ${ORDER_STATUS_AR[order.status]}\nالسبب: __________`,
                            ),
                        },
                      ],
                    );
                  }}
                />
              </View>
            </View>
          ) : null}

          <View style={styles.trustRow}>
            <ShieldCheck size={14} color={colors.success} />
            <Text style={styles.trustText}>
              الطلبات مؤمَّنة بالكامل. لو حصل أي مشكلة، الإدارة جاهزة على واتساب.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Stage timeline — uses the shared <OrderTimeline> primitive. We just adapt
// the order's statusHistory into the {key, label, Icon, completedAt} shape
// the primitive expects.
// ════════════════════════════════════════════════════════════════════════════

// STAGE_ICONS retained for the (unused) per-status timeline that some
// legacy components still query — see void below to keep the lint quiet.
const STAGE_ICONS: Record<string, typeof CheckCircle2> = {
  NEW: ClipboardCheck,
  UNDER_REVIEW: FileSearch,
  PRICED: HandCoins,
  ACCEPTED: CheckCircle2,
  DRIVER_ASSIGNED: UserCheck,
  PICKED_UP: Package,
  IN_ROUTE: Truck,
  DELIVERED: CheckCheck,
};
void STAGE_ICONS;

/**
 * Build the 4 visible phases for the OrderTimeline. The completedAt for
 * each phase is the earliest history entry whose toStatus belongs to the
 * phase — so a phase appears "completed" the moment any of its underlying
 * backend statuses was reached.
 */
function buildStages(history?: StatusHistoryItem[] | null): TimelineStage[] {
  const timestamps = new Map<string, string>();
  for (const h of history ?? []) timestamps.set(h.toStatus, h.createdAt);
  return PHASE_DEFS.map((phase) => {
    let earliest: string | null = null;
    for (const s of phase.statuses) {
      const t = timestamps.get(s);
      if (t && (!earliest || new Date(t) < new Date(earliest))) earliest = t;
    }
    return {
      key: phase.key,
      label: phase.label,
      description: phase.description,
      Icon: phase.Icon,
      completedAt: earliest,
    };
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Driver last-seen
// ════════════════════════════════════════════════════════════════════════════

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
        ? `منذ ${Math.floor(seconds / 60)} دقيقة`
        : `منذ ${Math.floor(seconds / 3600)} ساعة`;
  const fresh = seconds < 90;
  return (
    <Text
      style={{
        fontSize: 10,
        marginTop: 4,
        color: fresh ? colors.success : colors.text.muted,
        fontFamily: fontFamilies.bodyBold,
      }}
    >
      📍 آخر تحديث للموقع: {label}
    </Text>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Reorder
// ════════════════════════════════════════════════════════════════════════════

/**
 * "Pay online" entry point — rendered when the order is priced but not yet
 * paid. Navigates into PaymobCheckoutScreen so the user can pick Vodafone
 * Cash or InstaPay and complete the transaction in the system browser.
 * Cash-on-delivery customers can simply ignore the card.
 */
function PayOnlineCTA({ orderId, amount }: { orderId: string; amount: number }) {
  const navigation =
    useNavigation<NativeStackNavigationProp<OrdersStackParamList, 'OrderTracking'>>();
  return (
    <Pressable
      onPress={() => navigation.navigate('EasyKashCheckout', { orderId })}
      style={({ pressed }) => [styles.payCta, shadows.sm, pressed && { opacity: 0.92 }]}
    >
      <View style={styles.payCtaIcon}>
        <CreditCard size={22} color={colors.white} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.payCtaTitle}>ادفع أونلاين الآن</Text>
        <Text style={styles.payCtaSub}>
          {amount.toLocaleString('ar-EG')} ج.م · فودافون كاش / إنستا باي
        </Text>
      </View>
      <Text style={styles.payCtaArrow}>‹</Text>
    </Pressable>
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
      navigation.replace('OrderTracking', { orderId: newOrder.id, justCreated: true });
    },
    onError: (err) => Alert.alert('خطأ', err instanceof Error ? err.message : 'فشل إعادة الطلب'),
  });
  return (
    <GhostButton
      label={reorderMut.isPending ? 'جاري الإنشاء…' : `اطلب نفس الطلب (#${orderNumber}) مرة أخرى`}
      onPress={() => reorderMut.mutate()}
      disabled={reorderMut.isPending}
      Icon={RotateCcw}
    />
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Cancel order — only shown while the order is still in early stages
// ════════════════════════════════════════════════════════════════════════════

function CancelOrderButton({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  const cancelMut = useMutation({
    mutationFn: () =>
      api.raw.post(`/orders/${orderId}/cancel`, { reason: reason.trim() || 'لا يوجد سبب محدد' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      qc.invalidateQueries({ queryKey: ['orders-mine'] });
      setOpen(false);
      setReason('');
    },
    onError: (err) =>
      Alert.alert('تعذّر الإلغاء', err instanceof Error ? err.message : 'حصلت مشكلة'),
  });

  if (!open) {
    return (
      <GhostButton
        label={`إلغاء الطلب #${orderNumber}`}
        onPress={() => setOpen(true)}
        Icon={XIcon}
        tone="danger"
      />
    );
  }

  return (
    <View style={cancelStyles.card}>
      <Text style={cancelStyles.title}>تأكيد إلغاء الطلب</Text>
      <Text style={cancelStyles.sub}>
        هل أنت متأكد من إلغاء طلب #{orderNumber}؟ ده الإجراء نهائي ومش هتقدر ترجعه.
      </Text>

      <Text style={cancelStyles.label}>سبب الإلغاء (اختياري)</Text>
      <TextInput
        value={reason}
        onChangeText={setReason}
        placeholder="مثلاً: غيّرت رأيي، السعر مش مناسب…"
        placeholderTextColor={colors.text.muted}
        multiline
        maxLength={300}
        style={cancelStyles.input}
      />

      <View style={cancelStyles.actions}>
        <Pressable
          onPress={() => {
            setOpen(false);
            setReason('');
          }}
          style={({ pressed }) => [cancelStyles.cancelBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={cancelStyles.cancelBtnText}>تراجع</Text>
        </Pressable>
        <Pressable
          onPress={() => cancelMut.mutate()}
          disabled={cancelMut.isPending}
          style={({ pressed }) => [
            cancelStyles.confirmBtn,
            (pressed || cancelMut.isPending) && { opacity: 0.85 },
          ]}
        >
          {cancelMut.isPending ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={cancelStyles.confirmBtnText}>تأكيد الإلغاء</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const cancelStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.dangerLight,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.danger,
    padding: spacing.md,
  },
  title: {
    fontFamily: fontFamilies.headingBold,
    color: colors.danger,
    fontSize: fontSizes.md,
  },
  sub: {
    fontFamily: fontFamilies.body,
    color: colors.danger,
    fontSize: fontSizes.xs,
    marginTop: 4,
    lineHeight: 20,
  },
  label: {
    fontFamily: fontFamilies.bodyBold,
    color: colors.ink,
    fontSize: fontSizes.xs,
    marginTop: spacing.md,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.danger + '60',
    padding: spacing.sm,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.ink,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line2,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontFamily: fontFamilies.bodyBold,
    color: colors.ink,
    fontSize: fontSizes.sm,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    fontFamily: fontFamilies.headingBold,
    color: colors.white,
    fontSize: fontSizes.sm,
  },
});

// ════════════════════════════════════════════════════════════════════════════
// Review prompt
// ════════════════════════════════════════════════════════════════════════════

interface ReviewPromptProps {
  orderId: string;
  hasDriver: boolean;
  existingReview: { rating: number; comment?: string | null } | null;
}

function ReviewPrompt({ orderId, hasDriver, existingReview }: ReviewPromptProps) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(0);
  const [driverRating, setDriverRating] = useState(0);
  const [comment, setComment] = useState('');

  const submitMut = useMutation({
    mutationFn: () =>
      api.raw.post(`/orders/${orderId}/review`, {
        rating,
        ...(hasDriver && driverRating ? { driverRating } : {}),
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', orderId] });
    },
    onError: (err) => Alert.alert('خطأ', err instanceof Error ? err.message : 'فشل إرسال التقييم'),
  });

  if (existingReview) {
    return (
      <View style={[reviewStyles.done, shadows.sm]}>
        <View style={reviewStyles.doneRow}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Star
              key={i}
              size={18}
              color={colors.brand.gold}
              fill={i <= existingReview.rating ? colors.brand.gold : 'transparent'}
            />
          ))}
        </View>
        <Text style={reviewStyles.doneText}>تم تقييم الطلب — شكراً ❤️</Text>
      </View>
    );
  }

  return (
    <View style={[reviewStyles.card, shadows.md]}>
      <Text style={reviewStyles.cardTitle}>قيّم تجربتك معنا</Text>
      <Text style={reviewStyles.cardSub}>ملاحظاتك تساعدنا نقدّم خدمة أفضل</Text>

      <StarRow value={rating} onChange={setRating} label="التقييم العام" />
      {hasDriver ? (
        <StarRow value={driverRating} onChange={setDriverRating} label="تقييم السائق" />
      ) : null}

      <Text style={reviewStyles.commentLabel}>تعليق (اختياري)</Text>
      <TextInput
        value={comment}
        onChangeText={setComment}
        placeholder="ايه اللي عجبك أو ممكن نحسنه؟"
        placeholderTextColor={colors.text.muted}
        multiline
        maxLength={1000}
        style={reviewStyles.textArea}
      />

      <View style={{ marginTop: spacing.md }}>
        <PrimaryButton
          label="إرسال التقييم"
          onPress={() => rating > 0 && submitMut.mutate()}
          disabled={rating === 0}
          loading={submitMut.isPending}
        />
      </View>
    </View>
  );
}

function StarRow({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <View style={reviewStyles.starRow}>
      <Text style={reviewStyles.starLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Pressable key={i} onPress={() => onChange(i)} hitSlop={6}>
            <Star
              size={26}
              color={colors.brand.gold}
              fill={i <= value ? colors.brand.gold : 'transparent'}
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Styles
// ════════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  // Pay-online CTA (Paymob entry)
  payCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.brand.red,
    padding: spacing.md,
    borderRadius: radii.lg,
    marginBottom: spacing.lg,
  },
  payCtaIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  payCtaTitle: {
    color: colors.white,
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.sm,
  },
  payCtaSub: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  payCtaArrow: { color: colors.white, fontSize: 28, marginEnd: spacing.xs },
  // WA banner
  waBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#1A9F6E',
    padding: spacing.md,
    borderRadius: radii.lg,
    marginBottom: spacing.lg,
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
  },
  waBody: {
    color: 'rgba(255,255,255,0.92)',
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    marginTop: 2,
    lineHeight: 18,
  },
  waClose: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Status hero
  statusCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  statusEtaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusEtaText: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
  },
  statusHeadline: {
    fontSize: fontSizes.lg,
    color: colors.ink,
    fontFamily: fontFamilies.headingBlack,
    marginTop: spacing.md,
  },
  statusHint: {
    fontSize: fontSizes.sm,
    color: colors.text.secondary,
    fontFamily: fontFamilies.body,
    marginTop: 4,
    lineHeight: 22,
  },
  scheduledBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(242,169,59,0.12)',
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  scheduledBannerText: {
    fontSize: fontSizes.xs,
    color: '#92420D',
    fontFamily: fontFamilies.bodyExtraBold,
  },
  statusFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  statusFooterLabel: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
  },
  statusFooterValue: {
    fontSize: fontSizes.xl,
    color: colors.brand.red,
    fontFamily: fontFamilies.headingBlack,
    marginTop: 2,
  },
  statusFooterPending: {
    fontSize: fontSizes.sm,
    color: colors.warning,
    fontFamily: fontFamilies.bodyExtraBold,
    marginTop: 2,
  },
  statusFooterService: {
    fontSize: fontSizes.sm,
    color: colors.ink,
    fontFamily: fontFamilies.bodyExtraBold,
    marginTop: 2,
  },
  // Generic section card
  section: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: fontSizes.sm,
    color: colors.text.muted,
    fontFamily: fontFamilies.bodyExtraBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Sub-order rows (multi-merchant parent only)
  subOrderHint: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  subOrderRow: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  subOrderNum: {
    fontSize: fontSizes.sm,
    color: colors.ink,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  subOrderItems: {
    fontSize: fontSizes.xs,
    color: colors.text.secondary,
    fontFamily: fontFamilies.body,
  },
  subOrderPrice: {
    fontSize: fontSizes.sm,
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  subOrderStatusPill: {
    backgroundColor: colors.brand.redLight,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  subOrderStatusText: {
    fontSize: 10,
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyBold,
  },
  // Terminal
  terminalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.dangerLight,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  terminalTitle: {
    fontSize: fontSizes.sm,
    color: colors.danger,
    fontFamily: fontFamilies.headingBold,
  },
  terminalSub: {
    fontSize: fontSizes.xs,
    color: colors.danger,
    fontFamily: fontFamilies.body,
    marginTop: 2,
    lineHeight: 18,
  },
  // Driver
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.brand.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.white,
    fontFamily: fontFamilies.headingBlack,
    fontSize: fontSizes.lg,
  },
  driverName: {
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
    fontSize: fontSizes.md,
  },
  driverPhone: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  driverActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  driverActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.brand.red,
    paddingVertical: 10,
    borderRadius: radii.md,
  },
  driverActionWa: { backgroundColor: '#25D366' },
  driverActionSms: {
    backgroundColor: colors.brand.redLight,
    borderWidth: 1,
    borderColor: colors.brand.red + '40',
  },
  driverActionText: {
    color: colors.white,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xs,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  // Route
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeConnector: {
    width: 2,
    height: 16,
    backgroundColor: colors.line2,
    marginVertical: 2,
    marginStart: 4,
  },
  routeLabel: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
  },
  routeAddress: {
    fontSize: fontSizes.sm,
    color: colors.ink,
    fontFamily: fontFamilies.bodyBold,
    marginTop: 2,
  },
  // Notes
  notesText: {
    fontSize: fontSizes.sm,
    color: colors.text.primary,
    fontFamily: fontFamilies.body,
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  // Log
  logRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  logDotCol: { alignItems: 'center', width: 14 },
  logDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  logConnector: { width: 2, flex: 1, backgroundColor: colors.line2, marginTop: 2 },
  logTitle: {
    fontSize: fontSizes.sm,
    color: colors.ink,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  logReason: {
    fontSize: fontSizes.xs,
    color: colors.text.secondary,
    fontFamily: fontFamilies.body,
    marginTop: 2,
    lineHeight: 18,
  },
  logTime: {
    fontSize: 10,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    marginTop: 2,
  },
  // Actions
  actions: { marginTop: spacing.md },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.successLight,
    borderRadius: radii.md,
  },
  trustText: {
    flex: 1,
    fontSize: fontSizes.xs,
    color: colors.success,
    fontFamily: fontFamilies.bodyBold,
    lineHeight: 18,
  },
  cancelLockedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.warningLight,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.warning + '60',
  },
  cancelLockedText: {
    flex: 1,
    fontSize: fontSizes.xs,
    color: '#9A6B16',
    fontFamily: fontFamilies.bodyBold,
    lineHeight: 18,
  },
});

const reviewStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.brand.gold + '50',
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontFamily: fontFamilies.headingBold,
    color: colors.ink,
    fontSize: fontSizes.md,
  },
  cardSub: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.xs,
    marginTop: 2,
    marginBottom: spacing.md,
  },
  starRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  starLabel: {
    fontFamily: fontFamilies.bodyBold,
    color: colors.text.primary,
    fontSize: fontSizes.sm,
  },
  commentLabel: {
    fontFamily: fontFamilies.bodyBold,
    color: colors.text.secondary,
    fontSize: fontSizes.xs,
    marginTop: spacing.sm,
    marginBottom: 6,
  },
  textArea: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.ink,
    textAlign: 'right',
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: colors.line,
  },
  done: {
    backgroundColor: colors.brand.gold + '14',
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.brand.gold + '40',
  },
  doneRow: { flexDirection: 'row', gap: 2 },
  doneText: {
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
    fontSize: fontSizes.sm,
    marginTop: 6,
  },
});
