import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import {
  AlertTriangle,
  Box,
  Camera,
  ImagePlus,
  MapPin,
  Package,
  Weight,
  X,
  Zap,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { uploadFile } from '../lib/uploadFile';
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

  // Empty by default so the faded placeholder («مدينة الانطلاق» / «مدينة الوصول»)
  // shows as an example — the customer types the real cities.
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [weight, setWeight] = useState('');
  const [size, setSize] = useState<SizeKey>('SMALL');
  const [fragile, setFragile] = useState(false);
  const [speed, setSpeed] = useState<SpeedKey>('STANDARD');
  const [estimate, setEstimate] = useState<number | null>(null);
  // Optional shipment photo — lets the team verify the size/contents before pickup.
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const pickPhoto = async (source: 'camera' | 'gallery') => {
    // Camera needs a runtime permission; the gallery uses Android's system photo
    // picker (no permission needed — requesting one auto-denies on Android 13+).
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'إذن الكاميرا مطلوب',
          perm.canAskAgain
            ? 'اسمح باستخدام الكاميرا وحاول مرة أخرى.'
            : 'فعّل صلاحية الكاميرا من إعدادات الهاتف.',
        );
        return;
      }
    }
    const launch =
      source === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const res = await launch({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 });
    if (res.canceled || !res.assets?.[0]) return;
    const uri = res.assets[0].uri;
    setPhotoUri(uri);
    setUploadingPhoto(true);
    try {
      const up = await uploadFile(uri, { mime: 'image/jpeg' });
      if (!up.url || !/^https?:/.test(up.url)) throw new Error('upload failed');
      setPhotoUrl(up.url);
    } catch {
      Alert.alert('تعذّر رفع الصورة', 'تأكد من اتصالك بالإنترنت وحاول مرة أخرى.');
      setPhotoUri(null);
    } finally {
      setUploadingPhoto(false);
    }
  };

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

  // Region list drives the from/to pickers + the region→region price table.
  const { data: regionsData } = useQuery<{ regions: string[] }>({
    queryKey: ['shipping-regions'],
    queryFn: () => api.raw.get('/shipping/regions').then((r) => r.data.data),
    staleTime: 30 * 60_000,
  });
  const regions = regionsData?.regions ?? [];

  // Live price estimate — computed from the chosen from/to regions.
  useEffect(() => {
    if (!shippingService) return;
    if (!from || !to) {
      setEstimate(null);
      return;
    }
    const id = setTimeout(async () => {
      try {
        const res = await api.raw.post('/pricing/estimate', {
          serviceId: shippingService.id,
          fromRegion: from,
          toRegion: to,
          weightKg: parseFloat(weight) || undefined,
          sizeCategory: size,
          isFragile: fragile,
          speedTier: speed,
        });
        setEstimate(res.data.data.estimate);
      } catch {
        setEstimate(null);
      }
    }, 400);
    return () => clearTimeout(id);
  }, [shippingService, from, to, weight, size, fragile, speed]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!shippingService) throw new Error('خدمة الشحن غير متاحة');
      const res = await api.raw.post('/orders', {
        category: 'SHIPPING',
        serviceId: shippingService.id,
        fromRegion: from,
        toRegion: to,
        pickupAddress: from,
        deliveryAddress: to,
        weightKg: parseFloat(weight) || undefined,
        sizeCategory: size,
        isFragile: fragile,
        speedTier: speed,
        paymentMethod: 'CASH',
        imageUrls: photoUrl ? [photoUrl] : undefined,
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

  const canSubmit = !!from && !!to && from !== to && !submit.isPending;

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
        {/* From / To — pick from the priced regions */}
        <Text style={styles.section}>المسار</Text>
        <View style={styles.routeCard}>
          <View style={styles.routeRow}>
            <View style={[styles.routePin, { backgroundColor: colors.success }]} />
            <Text style={styles.routeLabel}>من</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.regionRow}
          >
            {regions.map((r) => {
              const on = from === r;
              return (
                <Pressable
                  key={`from-${r}`}
                  onPress={() => setFrom(r)}
                  style={[styles.regionChip, on && styles.regionChipOn]}
                >
                  <Text style={[styles.regionChipTxt, on && styles.regionChipTxtOn]}>{r}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.routeDivider} />

          <View style={styles.routeRow}>
            <View style={[styles.routePin, { backgroundColor: colors.brand.red }]} />
            <Text style={styles.routeLabel}>إلى</Text>
            <MapPin size={16} color={colors.brand.red} style={{ marginStart: 'auto' }} />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.regionRow}
          >
            {regions.map((r) => {
              const on = to === r;
              const disabled = from === r;
              return (
                <Pressable
                  key={`to-${r}`}
                  onPress={() => setTo(r)}
                  disabled={disabled}
                  style={[
                    styles.regionChip,
                    on && styles.regionChipOn,
                    disabled && styles.regionChipOff,
                  ]}
                >
                  <Text style={[styles.regionChipTxt, on && styles.regionChipTxtOn]}>{r}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
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

        {/* Shipment photo (optional) — helps verify size/contents before pickup */}
        <Text style={styles.subLabel}>صورة الشحنة (اختياري)</Text>
        <Text style={styles.photoHint}>صوّر الشحنة عشان نتأكد من حجمها وتفاصيلها قبل الاستلام</Text>
        {photoUri ? (
          <View style={styles.photoPreviewWrap}>
            <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
            {uploadingPhoto ? (
              <View style={styles.photoOverlay}>
                <ActivityIndicator color={colors.white} />
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  setPhotoUri(null);
                  setPhotoUrl(null);
                }}
                style={styles.photoRemove}
                hitSlop={8}
              >
                <X size={16} color={colors.white} />
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.photoActions}>
            <Pressable onPress={() => pickPhoto('camera')} style={styles.photoBtn}>
              <Camera size={18} color={colors.brand.red} />
              <Text style={styles.photoBtnText}>التقط صورة</Text>
            </Pressable>
            <Pressable onPress={() => pickPhoto('gallery')} style={styles.photoBtn}>
              <ImagePlus size={18} color={colors.brand.red} />
              <Text style={styles.photoBtnText}>من المعرض</Text>
            </Pressable>
          </View>
        )}

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
  regionRow: { gap: spacing.xs, paddingVertical: spacing.sm, paddingStart: 2 },
  regionChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  regionChipOn: {
    backgroundColor: colors.brand.red,
    borderColor: colors.brand.red,
  },
  regionChipOff: { opacity: 0.35 },
  regionChipTxt: {
    fontSize: fontSizes.sm,
    color: colors.ink,
    fontFamily: fontFamilies.bodyBold,
  },
  regionChipTxtOn: { color: colors.white },
  routeDivider: {
    height: 1,
    backgroundColor: colors.line2,
    marginVertical: spacing.xs,
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
  photoHint: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  photoActions: { flexDirection: 'row', gap: spacing.sm },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
  },
  photoBtnText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyBold,
    color: colors.ink,
  },
  photoPreviewWrap: {
    height: 160,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.line2,
  },
  photoPreview: { width: '100%', height: '100%' },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
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
