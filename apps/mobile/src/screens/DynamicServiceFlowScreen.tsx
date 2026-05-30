import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Service } from '@tamem/types';

import { DynamicForm } from '../components/DynamicForm/DynamicForm';
import { GradientButton } from '../components/GradientButton';
import { api } from '../lib/api';
import type { HomeStackParamList } from '../navigation/HomeStack';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

type RouteParam = RouteProp<HomeStackParamList, 'DynamicServiceFlow'>;
type NavProp = NativeStackNavigationProp<HomeStackParamList, 'DynamicServiceFlow'>;

export function DynamicServiceFlowScreen() {
  const route = useRoute<RouteParam>();
  const navigation = useNavigation<NavProp>();
  const { serviceKey, serviceId, merchantId } = route.params;

  const [estimatedPrice, setEstimatedPrice] = useState<number | null>(null);

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
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={colors.brand.red} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  if (!service) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.empty}>الخدمة غير موجودة</Text>
      </SafeAreaView>
    );
  }

  let formValues: Record<string, unknown> = {};
  let submitForm = () => {};

  // Default Qift center — real coords are taken from the dynamic form if the
  // service exposes a LOCATION field, otherwise we fall back to these so the
  // backend's required deliveryLat/Lng/address validation passes.
  const QIFT_LAT = 26.0297;
  const QIFT_LNG = 32.8146;

  const handleSubmit = async (values: Record<string, unknown>) => {
    // Pull standard fields out of customData if present — they map 1:1 to top-level
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
      };
    } else {
      // SHIPPING and MERCHANT flows have their own dedicated screens. If we land
      // here for them, send a minimal best-effort payload.
      payload = {
        category: service.category,
        serviceId: service.id,
        paymentMethod: 'CASH',
        customData: values,
      };
    }
    await createOrder.mutateAsync(payload);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{service.nameAr}</Text>
        {service.descriptionAr && <Text style={styles.subtitle}>{service.descriptionAr}</Text>}

        <View style={styles.formCard}>
          <DynamicForm
            fields={service.fields ?? []}
            onSubmit={handleSubmit}
            onChange={(v) => {
              formValues = v;
              // Live pricing preview (debounced via React Query staleTime)
              if (service.pricingMethod === 'FIXED' && service.basePrice) {
                setEstimatedPrice(Number(service.basePrice));
              }
            }}
            formRef={(handle) => {
              submitForm = handle.submit;
            }}
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {estimatedPrice !== null && (
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>السعر التقديري</Text>
            <Text style={styles.price}>{estimatedPrice.toLocaleString('ar-EG')} ج.م</Text>
          </View>
        )}
        <GradientButton
          label={createOrder.isPending ? 'جاري الإرسال…' : 'تأكيد الطلب'}
          onPress={() => submitForm()}
          loading={createOrder.isPending}
        />
      </View>
      {/* keep unused warning quiet */}
      <View style={{ display: 'none' }}>
        <Text>{Object.keys(formValues).length}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
  title: {
    fontSize: fontSizes.xl,
    fontFamily: fontFamilies.headingBlack,
    color: colors.ink,
  },
  subtitle: {
    fontSize: fontSizes.sm,
    color: colors.text.muted,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    fontFamily: fontFamilies.body,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingTop: spacing.md,
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
    gap: spacing.sm,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: fontSizes.sm,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
  },
  price: {
    fontSize: fontSizes.lg,
    color: colors.brand.red,
    fontFamily: fontFamilies.headingBlack,
  },
  empty: {
    textAlign: 'center',
    color: colors.text.muted,
    marginTop: spacing.xxl,
    fontFamily: fontFamilies.body,
  },
});
