import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Building2, MapPin, Package, Phone, Plus, Trash2, Truck, User } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
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

type Nav = NativeStackNavigationProp<HomeStackParamList, 'MerchantFlow'>;

interface ItemDraft {
  id: string;
  productNameSnapshot: string;
  quantity: string;
}
interface PickupDraft {
  id: string;
  address: string;
  contactName?: string;
  contactPhone?: string;
}
interface DeliveryDraft {
  id: string;
  address: string;
  recipientName: string;
  recipientPhone: string;
}

const newId = () => Math.random().toString(36).slice(2);

/**
 * B2B / merchant order flow — supports multiple products + multiple pickup
 * locations + multiple delivery locations. Pricing is QUOTE (admin sets manually).
 */
export function MerchantFlowScreen() {
  const navigation = useNavigation<Nav>();

  const [items, setItems] = useState<ItemDraft[]>([
    { id: newId(), productNameSnapshot: '', quantity: '1' },
  ]);
  const [pickups, setPickups] = useState<PickupDraft[]>([{ id: newId(), address: '' }]);
  const [deliveries, setDeliveries] = useState<DeliveryDraft[]>([
    { id: newId(), address: '', recipientName: '', recipientPhone: '' },
  ]);
  const [notes, setNotes] = useState('');

  const { data: services } = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: () => api.raw.get('/services').then((r) => r.data.data),
    // Service definitions are admin config — they change rarely.
    staleTime: 10 * 60_000,
  });
  const merchantService = useMemo(
    () => services?.find((s) => s.category === 'MERCHANT'),
    [services],
  );

  const submit = useMutation({
    mutationFn: async () => {
      if (!merchantService) throw new Error('خدمة التاجر غير متاحة');
      const res = await api.raw.post('/orders', {
        category: 'MERCHANT',
        serviceId: merchantService.id,
        notes: notes.trim() || undefined,
        items: items
          .filter((it) => it.productNameSnapshot.trim() && parseInt(it.quantity, 10) > 0)
          .map((it) => ({
            productNameSnapshot: it.productNameSnapshot.trim(),
            quantity: parseInt(it.quantity, 10),
          })),
        pickupPoints: pickups
          .filter((p) => p.address.trim())
          .map((p) => ({
            address: p.address.trim(),
            lat: 26.0297,
            lng: 32.8146,
            contactName: p.contactName?.trim() || undefined,
            contactPhone: p.contactPhone?.trim() || undefined,
          })),
        deliveryPoints: deliveries
          .filter((d) => d.address.trim() && d.recipientName.trim() && d.recipientPhone.trim())
          .map((d) => ({
            address: d.address.trim(),
            recipientName: d.recipientName.trim(),
            recipientPhone: d.recipientPhone.trim(),
            lat: 26.0297,
            lng: 32.8146,
          })),
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
    onError: (err) => Alert.alert('خطأ', err instanceof Error ? err.message : 'فشل الإرسال'),
  });

  const validItems = items.filter(
    (it) => it.productNameSnapshot.trim() && parseInt(it.quantity, 10) > 0,
  ).length;
  const validPickups = pickups.filter((p) => p.address.trim()).length;
  const validDeliveries = deliveries.filter(
    (d) => d.address.trim() && d.recipientName.trim() && d.recipientPhone.trim(),
  ).length;
  const canSubmit = validItems > 0 && validPickups > 0 && validDeliveries > 0 && !submit.isPending;

  if (!services) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={colors.brand.red} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <GradientHeader greeting="طلب تاجر / موزع" location="منتجات وكميات متعددة" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Items */}
        <SectionHeader Icon={Package} title="المنتجات المطلوبة" count={validItems} />
        {items.map((it, idx) => (
          <View key={it.id} style={styles.repeater}>
            <View style={styles.repeaterHeader}>
              <Text style={styles.repeaterTitle}>منتج {idx + 1}</Text>
              {items.length > 1 && (
                <Pressable onPress={() => setItems((p) => p.filter((x) => x.id !== it.id))}>
                  <Trash2 size={16} color={colors.danger} />
                </Pressable>
              )}
            </View>
            <TextInput
              value={it.productNameSnapshot}
              onChangeText={(v) =>
                setItems((p) =>
                  p.map((x) => (x.id === it.id ? { ...x, productNameSnapshot: v } : x)),
                )
              }
              placeholder="اسم المنتج (مثال: مياه معدنية كرتون)"
              placeholderTextColor={colors.text.muted}
              style={styles.input}
            />
            <View style={styles.qtyRow}>
              <Text style={styles.qtyLabel}>الكمية:</Text>
              <TextInput
                value={it.quantity}
                onChangeText={(v) =>
                  setItems((p) =>
                    p.map((x) => (x.id === it.id ? { ...x, quantity: v.replace(/\D/g, '') } : x)),
                  )
                }
                keyboardType="numeric"
                style={[styles.input, { flex: 0, width: 80, textAlign: 'center' }]}
              />
            </View>
          </View>
        ))}
        <AddButton
          label="إضافة منتج آخر"
          onPress={() =>
            setItems((p) => [...p, { id: newId(), productNameSnapshot: '', quantity: '1' }])
          }
        />

        {/* Pickup points */}
        <SectionHeader Icon={Building2} title="نقاط الاستلام" count={validPickups} />
        {pickups.map((p, idx) => (
          <View key={p.id} style={styles.repeater}>
            <View style={styles.repeaterHeader}>
              <Text style={styles.repeaterTitle}>نقطة استلام {idx + 1}</Text>
              {pickups.length > 1 && (
                <Pressable onPress={() => setPickups((arr) => arr.filter((x) => x.id !== p.id))}>
                  <Trash2 size={16} color={colors.danger} />
                </Pressable>
              )}
            </View>
            <TextInput
              value={p.address}
              onChangeText={(v) =>
                setPickups((arr) => arr.map((x) => (x.id === p.id ? { ...x, address: v } : x)))
              }
              placeholder="عنوان المخزن / المورد"
              placeholderTextColor={colors.text.muted}
              style={styles.input}
            />
            <View style={styles.contactRow}>
              <TextInput
                value={p.contactName ?? ''}
                onChangeText={(v) =>
                  setPickups((arr) =>
                    arr.map((x) => (x.id === p.id ? { ...x, contactName: v } : x)),
                  )
                }
                placeholder="اسم جهة الاتصال (اختياري)"
                placeholderTextColor={colors.text.muted}
                style={[styles.input, { flex: 1 }]}
              />
              <TextInput
                value={p.contactPhone ?? ''}
                onChangeText={(v) =>
                  setPickups((arr) =>
                    arr.map((x) => (x.id === p.id ? { ...x, contactPhone: v } : x)),
                  )
                }
                placeholder="هاتف"
                placeholderTextColor={colors.text.muted}
                keyboardType="phone-pad"
                style={[styles.input, { flex: 1 }]}
              />
            </View>
          </View>
        ))}
        <AddButton
          label="إضافة نقطة استلام أخرى"
          onPress={() => setPickups((arr) => [...arr, { id: newId(), address: '' }])}
        />

        {/* Delivery points */}
        <SectionHeader Icon={Truck} title="نقاط التسليم" count={validDeliveries} />
        {deliveries.map((d, idx) => (
          <View key={d.id} style={styles.repeater}>
            <View style={styles.repeaterHeader}>
              <Text style={styles.repeaterTitle}>نقطة تسليم {idx + 1}</Text>
              {deliveries.length > 1 && (
                <Pressable onPress={() => setDeliveries((arr) => arr.filter((x) => x.id !== d.id))}>
                  <Trash2 size={16} color={colors.danger} />
                </Pressable>
              )}
            </View>
            <TextInput
              value={d.address}
              onChangeText={(v) =>
                setDeliveries((arr) => arr.map((x) => (x.id === d.id ? { ...x, address: v } : x)))
              }
              placeholder="عنوان الفرع / المستلم"
              placeholderTextColor={colors.text.muted}
              style={styles.input}
            />
            <View style={styles.contactRow}>
              <View style={styles.iconInput}>
                <User size={14} color={colors.brand.red} />
                <TextInput
                  value={d.recipientName}
                  onChangeText={(v) =>
                    setDeliveries((arr) =>
                      arr.map((x) => (x.id === d.id ? { ...x, recipientName: v } : x)),
                    )
                  }
                  placeholder="اسم المستلم"
                  placeholderTextColor={colors.text.muted}
                  style={{ flex: 1, fontFamily: fontFamilies.body, textAlign: 'right' }}
                />
              </View>
              <View style={styles.iconInput}>
                <Phone size={14} color={colors.brand.red} />
                <TextInput
                  value={d.recipientPhone}
                  onChangeText={(v) =>
                    setDeliveries((arr) =>
                      arr.map((x) => (x.id === d.id ? { ...x, recipientPhone: v } : x)),
                    )
                  }
                  placeholder="الهاتف"
                  placeholderTextColor={colors.text.muted}
                  keyboardType="phone-pad"
                  style={{ flex: 1, fontFamily: fontFamilies.body, textAlign: 'right' }}
                />
              </View>
            </View>
          </View>
        ))}
        <AddButton
          label="إضافة نقطة تسليم أخرى"
          onPress={() =>
            setDeliveries((arr) => [
              ...arr,
              { id: newId(), address: '', recipientName: '', recipientPhone: '' },
            ])
          }
        />

        {/* Notes */}
        <SectionHeader Icon={MapPin} title="ملاحظات إضافية" />
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="مواعيد التسليم، أوقات العمل، تعليمات خاصة…"
          placeholderTextColor={colors.text.muted}
          multiline
          numberOfLines={3}
          style={[styles.input, styles.notesInput]}
        />

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky footer */}
      <View style={styles.footer}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>
            {validItems} منتج · {validPickups} استلام · {validDeliveries} تسليم
          </Text>
        </View>
        <Text style={styles.priceNote}>السعر يُحدَّد من الإدارة بعد المراجعة</Text>
        <GradientButton
          label={submit.isPending ? 'جاري الإرسال…' : 'طلب عرض سعر'}
          onPress={() => submit.mutate()}
          disabled={!canSubmit}
          loading={submit.isPending}
        />
      </View>
    </SafeAreaView>
  );
}

function SectionHeader({
  Icon,
  title,
  count,
}: {
  Icon: typeof Package;
  title: string;
  count?: number;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIcon}>
        <Icon size={16} color={colors.brand.red} />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
      {count !== undefined && count > 0 && (
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{count}</Text>
        </View>
      )}
    </View>
  );
}

function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
    >
      <Plus size={16} color={colors.brand.red} />
      <Text style={styles.addBtnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionIcon: {
    width: 30,
    height: 30,
    borderRadius: radii.md,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    flex: 1,
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.headingBold,
    color: colors.ink,
  },
  countBadge: {
    backgroundColor: colors.brand.red,
    paddingHorizontal: spacing.sm,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 22,
  },
  countBadgeText: { color: colors.white, fontSize: 11, fontFamily: fontFamilies.bodyExtraBold },
  repeater: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  repeaterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  repeaterTitle: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyBold,
    color: colors.text.muted,
  },
  input: {
    backgroundColor: colors.soft,
    borderRadius: radii.md,
    padding: spacing.sm,
    fontSize: fontSizes.sm,
    color: colors.text.primary,
    textAlign: 'right',
    fontFamily: fontFamilies.body,
    minHeight: 42,
  },
  notesInput: { minHeight: 72, textAlignVertical: 'top' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  qtyLabel: {
    fontSize: fontSizes.sm,
    color: colors.text.muted,
    fontFamily: fontFamilies.bodyBold,
  },
  contactRow: { flexDirection: 'row', gap: spacing.sm },
  iconInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.soft,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    minHeight: 42,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.brand.redLight,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  addBtnText: {
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
  },
  footer: {
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: spacing.sm,
  },
  summaryRow: { alignItems: 'center' },
  summaryText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyBold,
    color: colors.text.primary,
  },
  priceNote: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    textAlign: 'center',
  },
});
