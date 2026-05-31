import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Service } from '@tamem/types';

import { CouponInput } from '../components/CouponInput';
import { DynamicForm } from '../components/DynamicForm/DynamicForm';
import { ScreenHeader } from '../components/ScreenHeader';
import { CardListSkeleton, EmptyState, PrimaryButton } from '../components/ui';
import { api } from '../lib/api';
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
      try {
        const parent = navigation.getParent();
        if (parent) {
          parent.navigate('Orders', { screen: 'OrdersList' } as never);
          Alert.alert('تم استلام طلبك ✓', `رقم الطلب: ${order.orderNumber ?? '—'}`);
        } else {
          navigation.popToTop();
        }
      } catch {
        navigation.popToTop();
      }
    },
    onError: (err) => {
      Alert.alert('خطأ', err instanceof Error ? err.message : 'فشل إرسال الطلب');
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

  // Qift center fallback — used when the dynamic form doesn't expose a
  // LOCATION field so the backend's required deliveryLat/Lng/address checks
  // still pass.
  const QIFT_LAT = 26.0297;
  const QIFT_LNG = 32.8146;

  const handleSubmit = async (values: Record<string, unknown>) => {
    formValuesRef.current = values;

    const notes =
      typeof values.notes === 'string'
        ? values.notes
        : typeof values.details === 'string'
          ? values.details
          : (Object.values(values).find((v): v is string => typeof v === 'string') ?? '');

    const imageUrls = Array.isArray(values.imageUrls)
      ? (values.imageUrls.filter((u) => typeof u === 'string') as string[])
      : Array.isArray(values.images)
        ? (values.images.filter((u) => typeof u === 'string') as string[])
        : undefined;

    const address =
      (typeof values.deliveryAddress === 'string' && values.deliveryAddress.trim()) ||
      'الرجاء تأكيد العنوان مع الإدارة';
    const lat = typeof values.deliveryLat === 'number' ? values.deliveryLat : QIFT_LAT;
    const lng = typeof values.deliveryLng === 'number' ? values.deliveryLng : QIFT_LNG;

    let payload: Record<string, unknown>;
    if (service.category === 'DELIVERY') {
      payload = {
        category: 'DELIVERY',
        serviceId: service.id,
        deliveryAddress: address,
        deliveryLat: lat,
        deliveryLng: lng,
        notes: notes || undefined,
        imageUrls,
        paymentMethod: 'CASH',
        customData: values,
        ...(merchantId ? { merchantId } : {}),
        ...(coupon ? { couponCode: coupon.code } : {}),
      };
    } else {
      payload = {
        category: service.category,
        serviceId: service.id,
        paymentMethod: 'CASH',
        customData: values,
        ...(coupon ? { couponCode: coupon.code } : {}),
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
              <Text style={styles.priceLineValue}>{basePrice.toLocaleString('ar-EG')} ج.م</Text>
            </View>
            {coupon ? (
              <View style={styles.priceLine}>
                <Text style={styles.priceLineDiscountLabel}>خصم الكوبون ({coupon.code})</Text>
                <Text style={styles.priceLineDiscount}>
                  -{coupon.discount.toLocaleString('ar-EG')} ج.م
                </Text>
              </View>
            ) : null}
            <View style={styles.priceDivider} />
            <View style={styles.priceLine}>
              <Text style={styles.priceTotalLabel}>الإجمالي</Text>
              <Text style={styles.priceTotal}>{finalPrice.toLocaleString('ar-EG')} ج.م</Text>
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
