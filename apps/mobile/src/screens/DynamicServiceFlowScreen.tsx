import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Service } from '@tamem/types';

import { Calendar, Clock } from 'lucide-react-native';
import { Pressable } from 'react-native';

import { AddressPicker, type PickedAddress } from '../components/AddressPicker';
import { CouponInput } from '../components/CouponInput';
import { DynamicForm } from '../components/DynamicForm/DynamicForm';
import { PaymentMethodPicker, type PaymentMethod } from '../components/PaymentMethodPicker';
import { ScreenHeader } from '../components/ScreenHeader';
import { SchedulePicker } from '../components/SchedulePicker';
import { CardListSkeleton, EmptyState, MoneyText, PrimaryButton } from '../components/ui';
import { palette, typography } from '../theme/tokens';
import { api } from '../lib/api';
import { showToast } from '../lib/toast';
import type { HomeStackParamList } from '../navigation/HomeStack';
import { colors, fontFamilies, fontSizes, radii, shadows, spacing } from '../theme/tokens';

type RouteParam = RouteProp<HomeStackParamList, 'DynamicServiceFlow'>;
type NavProp = NativeStackNavigationProp<HomeStackParamList, 'DynamicServiceFlow'>;

interface AppliedCoupon {
  code: string;
  discount: number;
  finalAmount: number;
}

export function DynamicServiceFlowScreen() {
  const route = useRoute<RouteParam>();
  const navigation = useNavigation<NavProp>();
  const { serviceKey, serviceId, merchantId } = route.params;

  const [estimatedPrice, setEstimatedPrice] = useState<number | null>(null);
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [address, setAddress] = useState<PickedAddress | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false);
  const formValuesRef = useRef<Record<string, unknown>>({});
  const submitFormRef = useRef<() => void>(() => {});

  // Find the service by key or id
  const { data: services, isLoading: loadingServices } = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: () => api.raw.get('/services').then((r) => r.data.data),
  });

  const sourceService = services?.find(
    (s) => (serviceId && s.id === serviceId) || (serviceKey && s.key === serviceKey),
  );

  const { data: service, isLoading: loadingFields } = useQuery<Service>({
    queryKey: ['service', sourceService?.id],
    enabled: !!sourceService?.id,
    queryFn: () => api.raw.get(`/services/${sourceService!.id}`).then((r) => r.data.data),
  });

  const createOrder = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.raw.post('/orders', payload).then((r) => r.data.data),
    onSuccess: (order) => {
      // Land the customer on the live tracking screen for the order they
      // just created — was OrdersList before, which felt like the action
      // disappeared into a haystack.
      try {
        const parent = navigation.getParent();
        if (parent) {
          parent.navigate('Orders', {
            screen: 'OrderTracking',
            params: { orderId: order.id, justCreated: true },
          } as never);
        } else {
          navigation.popToTop();
        }
      } catch {
        navigation.popToTop();
      }
      showToast({
        title: 'تم استلام طلبك',
        message: `رقم الطلب: #${order.orderNumber ?? '—'}`,
        tone: 'success',
      });
    },
    onError: (err) => {
      showToast({
        title: 'تعذّر إرسال الطلب',
        message: err instanceof Error ? err.message : 'حصلت مشكلة',
        tone: 'error',
      });
    },
  });

  if (loadingServices || loadingFields) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScreenHeader title="جاري التحميل" />
        <View style={styles.skelPad}>
          <CardListSkeleton count={4} />
        </View>
      </SafeAreaView>
    );
  }

  if (!service) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScreenHeader title="خطأ" />
        <EmptyState title="الخدمة غير موجودة" subtitle="حاول الرجوع واختيار خدمة أخرى." />
      </SafeAreaView>
    );
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    formValuesRef.current = values;

    const notes =
      typeof values.notes === 'string'
        ? values.notes
        : typeof values.details === 'string'
          ? values.details
          : '';

    const imageUrls = Array.isArray(values.imageUrls)
      ? (values.imageUrls.filter((u) => typeof u === 'string') as string[])
      : Array.isArray(values.images)
        ? (values.images.filter((u) => typeof u === 'string') as string[])
        : undefined;

    // Prefer the explicit address picker; fall back to a LOCATION field on
    // the dynamic form only if it exposes one with real lat/lng. Never use
    // hard-coded Qift coordinates.
    const formAddress =
      typeof values.deliveryAddress === 'string' ? values.deliveryAddress.trim() : '';
    const formLat = typeof values.deliveryLat === 'number' ? values.deliveryLat : undefined;
    const formLng = typeof values.deliveryLng === 'number' ? values.deliveryLng : undefined;

    let finalAddress = address?.address ?? formAddress;
    // lat/lng are OPTIONAL — a zoned address routes without a pin. Coerce the
    // picker's `number | null` to `number | undefined` for the payload.
    let finalLat: number | undefined =
      address && !address.isFreeText ? (address.lat ?? undefined) : formLat;
    let finalLng: number | undefined =
      address && !address.isFreeText ? (address.lng ?? undefined) : formLng;

    const hasZone = !!(address?.zone?.cityId || address?.zone?.villageId || address?.zone?.areaId);
    const hasPin = finalLat != null && finalLng != null;
    if (service.category === 'DELIVERY' && (!finalAddress || (!hasZone && !hasPin))) {
      showToast({
        title: 'حدّد منطقة العنوان',
        message: 'اختر منطقة التوصيل لهذا العنوان أو استخدم موقعك الحالي',
        tone: 'error',
      });
      return;
    }

    let payload: Record<string, unknown>;
    if (service.category === 'DELIVERY') {
      payload = {
        category: 'DELIVERY',
        serviceId: service.id,
        deliveryAddress: finalAddress,
        deliveryLat: finalLat,
        deliveryLng: finalLng,
        // Zone metadata is advisory — backend re-quotes via /zones/quote-delivery.
        cityId: address?.zone?.cityId,
        villageId: address?.zone?.villageId,
        areaId: address?.zone?.areaId,
        notes: notes || undefined,
        imageUrls,
        paymentMethod,
        customData: values,
        ...(merchantId ? { merchantId } : {}),
        ...(coupon ? { couponCode: coupon.code } : {}),
        ...(scheduledFor ? { scheduledFor } : {}),
      };
    } else {
      payload = {
        category: service.category,
        serviceId: service.id,
        paymentMethod,
        customData: values,
        ...(coupon ? { couponCode: coupon.code } : {}),
        ...(scheduledFor ? { scheduledFor } : {}),
      };
    }
    await createOrder.mutateAsync(payload);
  };

  const basePrice = estimatedPrice ?? Number(service.basePrice ?? 0);
  const finalPrice = coupon ? coupon.finalAmount : basePrice;

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader title={service.nameAr} subtitle={service.descriptionAr ?? undefined} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.formCard, shadows.sm]}>
          <DynamicForm
            fields={service.fields ?? []}
            onSubmit={handleSubmit}
            onChange={(v) => {
              formValuesRef.current = v;
              if (service.pricingMethod === 'FIXED' && service.basePrice) {
                setEstimatedPrice(Number(service.basePrice));
              }
            }}
            formRef={(handle) => {
              submitFormRef.current = handle.submit;
            }}
          />
        </View>

        {/* ─────── Address (DELIVERY only) ─────── */}
        {service.category === 'DELIVERY' ? (
          <>
            <Text style={styles.sectionTitle}>عنوان التوصيل</Text>
            <AddressPicker value={address} onChange={setAddress} />
          </>
        ) : null}

        {/* ─────── Schedule (optional) ─────── */}
        <Text style={styles.sectionTitle}>ميعاد التوصيل</Text>
        <Pressable
          onPress={() => setScheduleSheetOpen(true)}
          style={({ pressed }) => [styles.scheduleRow, pressed && { opacity: 0.92 }]}
        >
          <View
            style={[
              styles.scheduleIcon,
              { backgroundColor: scheduledFor ? palette.red[50] : colors.soft },
            ]}
          >
            {scheduledFor ? (
              <Calendar size={20} color={palette.red[600]} />
            ) : (
              <Clock size={20} color={colors.text.secondary} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.bodyBold, { color: colors.ink }]}>
              {scheduledFor ? 'مجدول' : 'توصيل فوري'}
            </Text>
            <Text style={[typography.caption, { color: colors.text.muted, marginTop: 2 }]}>
              {scheduledFor
                ? new Date(scheduledFor).toLocaleString('ar-EG', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'هنبدأ المراجعة فوراً'}
            </Text>
          </View>
          <Text style={[typography.smallBold, { color: palette.red[600] }]}>
            {scheduledFor ? 'تعديل' : 'جدولة'}
          </Text>
        </Pressable>

        {/* ─────── Payment method ─────── */}
        <Text style={styles.sectionTitle}>طريقة الدفع</Text>
        <PaymentMethodPicker value={paymentMethod} onChange={setPaymentMethod} />

        {/* ─────── Coupon ─────── */}
        <Text style={styles.sectionTitle}>كوبون الخصم</Text>
        <CouponInput
          orderAmount={basePrice}
          onApplied={(code, discount, finalAmount) => setCoupon({ code, discount, finalAmount })}
          onCleared={() => setCoupon(null)}
        />

        {/* ─────── Price breakdown ─────── */}
        {basePrice > 0 ? (
          <View style={[styles.priceCard, shadows.sm]}>
            <View style={styles.priceLine}>
              <Text style={styles.priceLineLabel}>سعر الخدمة</Text>
              <MoneyText amount={basePrice} size="sm" />
            </View>
            {coupon ? (
              <View style={styles.priceLine}>
                <Text style={styles.priceLineDiscountLabel}>خصم الكوبون ({coupon.code})</Text>
                <MoneyText amount={-coupon.discount} size="sm" tone="success" />
              </View>
            ) : null}
            <View style={styles.priceDivider} />
            <View style={styles.priceLine}>
              <Text style={styles.priceTotalLabel}>الإجمالي</Text>
              <MoneyText amount={finalPrice} size="lg" tone="brand" />
            </View>
          </View>
        ) : null}

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={[styles.footer, shadows.lg]}>
        <PrimaryButton
          label={createOrder.isPending ? 'جاري الإرسال…' : 'تأكيد الطلب'}
          onPress={() => submitFormRef.current()}
          loading={createOrder.isPending}
        />
      </View>

      <SchedulePicker
        visible={scheduleSheetOpen}
        onClose={() => setScheduleSheetOpen(false)}
        onConfirm={setScheduledFor}
        initial={scheduledFor}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg },
  skelPad: { padding: spacing.lg, gap: spacing.md },
  formCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.headingBlack,
    color: colors.text.muted,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  scheduleIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  priceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  priceLineLabel: {
    fontFamily: fontFamilies.body,
    color: colors.text.secondary,
    fontSize: fontSizes.sm,
  },
  priceLineValue: {
    fontFamily: fontFamilies.bodyBold,
    color: colors.ink,
    fontSize: fontSizes.sm,
  },
  priceLineDiscountLabel: {
    fontFamily: fontFamilies.body,
    color: colors.success,
    fontSize: fontSizes.sm,
  },
  priceLineDiscount: {
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.success,
    fontSize: fontSizes.sm,
  },
  priceDivider: {
    height: 1,
    backgroundColor: colors.line,
    marginVertical: spacing.sm,
  },
  priceTotalLabel: {
    fontFamily: fontFamilies.headingBold,
    color: colors.ink,
    fontSize: fontSizes.md,
  },
  priceTotal: {
    fontFamily: fontFamilies.headingBlack,
    color: colors.brand.red,
    fontSize: fontSizes.xl,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    padding: spacing.lg,
  },
});
