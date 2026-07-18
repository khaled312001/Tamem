import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { AlertTriangle, Box, MapPin, Package, Weight, Zap } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Service } from '@tamem/types';

import { GradientButton } from '../components/GradientButton';
import { GradientHeader } from '../components/GradientHeader';
import { api } from '../lib/api';
import type { HomeStackParamList } from '../navigation/HomeStack';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'ShippingFlow'>;

type SizeKey = 'SMALL' | 'MEDIUM' | 'LARGE';
type SpeedKey = 'STANDARD' | 'EXPRESS';

const SIZES: { key: SizeKey; label: string; sub: string }[] = [
  { key: 'SMALL', label: 'صغير', sub: 'ظرف، طرد < 5 كجم' },
  { key: 'MEDIUM', label: 'وسط', sub: 'كرتونة، 5-15 كجم' },
  { key: 'LARGE', label: 'كبير', sub: '> 15 كجم أو حجم كبير' },
];

const SPEEDS: { key: SpeedKey; label: string; sub: string; multiplier: string }[] = [
  { key: 'STANDARD', label: 'عادي', sub: 'خلال 24 ساعة', multiplier: '×1' },
  { key: 'EXPRESS', label: 'سريع', sub: 'خلال 6 ساعات', multiplier: '×1.25' },
];

/**
 * Full shipping flow — from/to addresses, weight, size, fragile, speed,
 * live price preview via /pricing/estimate, then POST /orders.
 */
export function ShippingFlowScreen() {
  const navigation = useNavigation<Nav>();

  const [from, setFrom] = useState('قفط');
  const [to, setTo] = useState('الأقصر');
  const [weight, setWeight] = useState('');
  const [size, setSize] = useState<SizeKey>('SMALL');
  const [fragile, setFragile] = useState(false);
  const [speed, setSpeed] = useState<SpeedKey>('STANDARD');
  const [estimate, setEstimate] = useState<number | null>(null);

  const { data: services } = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: () => api.raw.get('/services').then((r) => r.data.data),
    // Service definitions are admin config — they change rarely.
    staleTime: 10 * 60_000,
  });

  const shippingService = useMemo(
    () => services?.find((s) => s.category === 'SHIPPING'),
    [services],
  );

  // Live price estimate (debounced via stale time in React Query)
  useEffect(() => {
    if (!shippingService) return;
    const weightNum = parseFloat(weight);
    if (!Number.isFinite(weightNum) || weightNum <= 0) {
      setEstimate(null);
      return;
    }
    const id = setTimeout(async () => {
      try {
        const res = await api.raw.post('/pricing/estimate', {
          serviceId: shippingService.id,
          // Default Qift → Luxor coords for live estimate
          pickupLat: 26.0297,
          pickupLng: 32.8146,
          deliveryLat: 25.6872,
          deliveryLng: 32.6396,
          weightKg: weightNum,
          sizeCategory: size,
          isFragile: fragile,
          speedTier: speed,
        });
        setEstimate(res.data.data.estimate);
      } catch {
        setEstimate(null);
      }
    }, 500);
    return () => clearTimeout(id);
  }, [shippingService, weight, size, fragile, speed]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!shippingService) throw new Error('خدمة الشحن غير متاحة');
      const res = await api.raw.post('/orders', {
        category: 'SHIPPING',
        serviceId: shippingService.id,
        pickupAddress: from,
        pickupLat: 26.0297,
        pickupLng: 32.8146,
        deliveryAddress: to,
        deliveryLat: 25.6872,
        deliveryLng: 32.6396,
        weightKg: parseFloat(weight),
        sizeCategory: size,
        isFragile: fragile,
        speedTier: speed,
        paymentMethod: 'CASH',
      });
      return res.data.data;
    },
    onSuccess: (order) => {
      try {
        const parent = navigation.getParent();
        if (parent) {
          parent.navigate('Orders', {
            screen: 'OrderTracking',
            params: { orderId: order.id, justCreated: true },
          } as never);
          Alert.alert('تم استلام طلبك', `رقم الطلب: ${order.orderNumber ?? '—'}`);
        } else {
          navigation.popToTop();
        }
      } catch {
        navigation.popToTop();
      }
    },
    onError: (err) => {
      Alert.alert('خطأ', err instanceof Error ? err.message : 'فشل إنشاء الطلب');
    },
  });

  const canSubmit =
    from.trim().length >= 2 && to.trim().length >= 2 && parseFloat(weight) > 0 && !submit.isPending;

  if (!services) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={colors.brand.red} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <GradientHeader greeting="طلب شحن" location="بين المناطق" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* From / To */}
        <Text style={styles.section}>المسار</Text>
        <View style={styles.routeCard}>
          <View style={styles.routeRow}>
            <View style={[styles.routePin, { backgroundColor: colors.success }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.routeLabel}>من</Text>
              <TextInput
                value={from}
                onChangeText={setFrom}
                placeholder="مدينة الانطلاق"
                placeholderTextColor={colors.text.muted}
                style={styles.routeInput}
              />
            </View>
          </View>
          <View style={styles.routeDivider} />
          <View style={styles.routeRow}>
            <View style={[styles.routePin, { backgroundColor: colors.brand.red }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.routeLabel}>إلى</Text>
              <TextInput
                value={to}
                onChangeText={setTo}
                placeholder="مدينة الوصول"
                placeholderTextColor={colors.text.muted}
                style={styles.routeInput}
              />
            </View>
            <MapPin size={18} color={colors.brand.red} />
          </View>
        </View>

        {/* Weight */}
        <Text style={styles.section}>تفاصيل الشحنة</Text>
        <View style={styles.inputWrap}>
          <Weight size={18} color={colors.brand.red} />
          <TextInput
            value={weight}
            onChangeText={setWeight}
            keyboardType="numeric"
            placeholder="الوزن بالكيلو"
            placeholderTextColor={colors.text.muted}
            style={styles.input}
          />
          <Text style={styles.unitLabel}>كجم</Text>
        </View>

        {/* Size */}
        <Text style={styles.subLabel}>الحجم</Text>
        <View style={styles.optionsRow}>
          {SIZES.map((s) => {
            const on = size === s.key;
            return (
              <Pressable
                key={s.key}
                onPress={() => setSize(s.key)}
                style={[styles.optionCard, on && styles.optionCardOn]}
              >
                <Box size={18} color={on ? colors.white : colors.brand.red} />
                <Text style={[styles.optionLabel, on && { color: colors.white }]}>{s.label}</Text>
                <Text style={[styles.optionSub, on && { color: 'rgba(255,255,255,0.85)' }]}>
                  {s.sub}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Fragile */}
        <View style={styles.switchRow}>
          <View style={styles.switchIcon}>
            <AlertTriangle size={18} color={colors.brand.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>شحنة قابلة للكسر</Text>
            <Text style={styles.switchHint}>تغليف إضافي + رسوم خاصة</Text>
          </View>
          <Switch
            value={fragile}
            onValueChange={setFragile}
            trackColor={{ false: colors.line2, true: colors.brand.red }}
            thumbColor={colors.white}
          />
        </View>

        {/* Speed */}
        <Text style={styles.subLabel}>سرعة الشحن</Text>
        <View style={styles.optionsRow}>
          {SPEEDS.map((s) => {
            const on = speed === s.key;
            return (
              <Pressable
                key={s.key}
                onPress={() => setSpeed(s.key)}
                style={[styles.optionCard, on && styles.optionCardOn]}
              >
                <Zap size={18} color={on ? colors.white : colors.brand.red} />
                <Text style={[styles.optionLabel, on && { color: colors.white }]}>
                  {s.label} {s.multiplier}
                </Text>
                <Text style={[styles.optionSub, on && { color: 'rgba(255,255,255,0.85)' }]}>
                  {s.sub}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Sticky bottom: estimate + CTA */}
      <LinearGradient
        colors={[colors.surface + '00', colors.surface]}
        style={[styles.fade, { pointerEvents: 'none' }]}
      />
      <View style={styles.footer}>
        <View style={styles.estimateRow}>
          <Package size={18} color={colors.text.muted} />
          <Text style={styles.estimateLabel}>التكلفة التقديرية</Text>
          <Text style={styles.estimateValue}>{estimate !== null ? `${estimate} ج.م` : '—'}</Text>
        </View>
        <GradientButton
          label={submit.isPending ? 'جاري الإرسال…' : 'تأكيد طلب الشحن'}
          onPress={() => submit.mutate()}
          disabled={!canSubmit}
          loading={submit.isPending}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg },
  section: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.headingBold,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  subLabel: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyBold,
    color: colors.text.primary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  routeCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
  },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  routePin: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  routeLabel: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
  },
  routeInput: {
    fontSize: fontSizes.md,
    color: colors.ink,
    fontFamily: fontFamilies.bodyExtraBold,
    paddingVertical: 4,
  },
  routeDivider: {
    width: 1,
    height: 16,
    backgroundColor: colors.line2,
    marginVertical: spacing.xs,
    marginStart: 5,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  input: {
    flex: 1,
    fontSize: fontSizes.md,
    color: colors.ink,
    textAlign: 'right',
    fontFamily: fontFamilies.body,
  },
  unitLabel: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.bodyBold,
  },
  optionsRow: { flexDirection: 'row', gap: spacing.sm },
  optionCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    padding: spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  optionCardOn: { backgroundColor: colors.brand.red, borderColor: colors.brand.red },
  optionLabel: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.headingBold,
    color: colors.ink,
  },
  optionSub: {
    fontSize: 10,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    textAlign: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  switchIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.brand.gold + '25',
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchLabel: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
  },
  switchHint: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    marginTop: 2,
  },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 110, height: 40 },
  footer: {
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: spacing.sm,
  },
  estimateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  estimateLabel: {
    flex: 1,
    fontSize: fontSizes.sm,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
  },
  estimateValue: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.headingBold,
    color: colors.brand.red,
  },
});
