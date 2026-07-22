import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Box, MapPin, Package, Phone, Plus, Store, Trash2, User } from 'lucide-react-native';
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

type PkgSize = 'BAG' | 'CARTON';

interface OrderDraft {
  id: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  size: PkgSize;
}

const newId = () => Math.random().toString(36).slice(2);
const SIZE_LABEL: Record<PkgSize, string> = { BAG: 'كيس', CARTON: 'كرتونة' };

/**
 * Merchant / distributor flow. The trader enters their own details once, then
 * adds an order per customer (name / phone / address / package size). Delivery
 * price is set by the admin from the distance between the trader and each
 * customer, so no products or prices are collected here.
 */
export function MerchantFlowScreen() {
  const navigation = useNavigation<Nav>();

  const [merchantName, setMerchantName] = useState('');
  const [merchantAddress, setMerchantAddress] = useState('');
  const [merchantPhone, setMerchantPhone] = useState('');
  const [orders, setOrders] = useState<OrderDraft[]>([
    { id: newId(), customerName: '', customerPhone: '', customerAddress: '', size: 'BAG' },
  ]);

  const { data: services } = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: () => api.raw.get('/services').then((r) => r.data.data),
    staleTime: 10 * 60_000,
  });
  const merchantService = useMemo(
    () => services?.find((s) => s.category === 'MERCHANT'),
    [services],
  );

  const validOrders = orders.filter(
    (o) => o.customerName.trim() && o.customerPhone.trim() && o.customerAddress.trim(),
  );
  const canSubmit =
    merchantName.trim().length >= 2 && merchantPhone.trim().length >= 6 && validOrders.length > 0;

  const setOrder = (id: string, patch: Partial<OrderDraft>) =>
    setOrders((p) => p.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  const submit = useMutation({
    mutationFn: async () => {
      if (!merchantService) throw new Error('خدمة التاجر غير متاحة');
      const list = validOrders.map((o) => ({
        customerName: o.customerName.trim(),
        customerPhone: o.customerPhone.trim(),
        customerAddress: o.customerAddress.trim(),
        size: o.size,
        sizeLabel: SIZE_LABEL[o.size],
      }));
      const notes =
        `🏪 التاجر: ${merchantName.trim()}\n` +
        `📍 العنوان: ${merchantAddress.trim() || '—'}\n` +
        `📞 الهاتف: ${merchantPhone.trim()}\n\n` +
        `الأوردرات (${list.length}):\n` +
        list
          .map(
            (o, i) =>
              `${i + 1}) ${o.customerName} — ${o.customerPhone}\n   📍 ${o.customerAddress} — ${o.sizeLabel}`,
          )
          .join('\n');

      const res = await api.raw.post('/orders', {
        category: 'MERCHANT',
        serviceId: merchantService.id,
        // The trader's own address is the pickup; deliveries live per-order in
        // customData. deliveryAddress mirrors it so the backend never falls back
        // to the account's default address.
        pickupAddress: merchantAddress.trim() || merchantName.trim(),
        deliveryAddress: merchantAddress.trim() || merchantName.trim(),
        paymentMethod: 'CASH',
        notes,
        customData: {
          merchantOrder: true,
          merchant: {
            name: merchantName.trim(),
            address: merchantAddress.trim(),
            phone: merchantPhone.trim(),
          },
          orders: list,
        },
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

  if (!services) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={colors.brand.red} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <GradientHeader greeting="طلب تاجر / موزع" location="بياناتك وأوردرات عملائك" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Merchant info ── */}
        <SectionHeader Icon={Store} title="بيانات التاجر" />
        <View style={styles.card}>
          <Field
            Icon={User}
            value={merchantName}
            onChangeText={setMerchantName}
            placeholder="اسم التاجر / المحل"
          />
          <Field
            Icon={MapPin}
            value={merchantAddress}
            onChangeText={setMerchantAddress}
            placeholder="عنوان التاجر (مثال: قفط - شارع المحطة)"
          />
          <Field
            Icon={Phone}
            value={merchantPhone}
            onChangeText={(v) => setMerchantPhone(v.replace(/[^\d+]/g, ''))}
            placeholder="رقم تليفون التاجر"
            keyboardType="phone-pad"
            last
          />
        </View>

        {/* ── Orders (per customer) ── */}
        <SectionHeader Icon={Package} title="الأوردرات" count={validOrders.length} />
        {orders.map((o, idx) => (
          <View key={o.id} style={styles.repeater}>
            <View style={styles.repeaterHeader}>
              <Text style={styles.repeaterTitle}>أوردر {idx + 1}</Text>
              {orders.length > 1 && (
                <Pressable
                  onPress={() => setOrders((p) => p.filter((x) => x.id !== o.id))}
                  hitSlop={8}
                >
                  <Trash2 size={16} color={colors.danger} />
                </Pressable>
              )}
            </View>
            <Field
              Icon={User}
              value={o.customerName}
              onChangeText={(v) => setOrder(o.id, { customerName: v })}
              placeholder="اسم العميل"
            />
            <Field
              Icon={Phone}
              value={o.customerPhone}
              onChangeText={(v) => setOrder(o.id, { customerPhone: v.replace(/[^\d+]/g, '') })}
              placeholder="رقم تليفون العميل"
              keyboardType="phone-pad"
            />
            <Field
              Icon={MapPin}
              value={o.customerAddress}
              onChangeText={(v) => setOrder(o.id, { customerAddress: v })}
              placeholder="عنوان العميل (المدينة / القرية / الشارع)"
            />
            <Text style={styles.sizeLabel}>حجم الأوردر</Text>
            <View style={styles.sizeRow}>
              {(['BAG', 'CARTON'] as PkgSize[]).map((s) => {
                const on = o.size === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setOrder(o.id, { size: s })}
                    style={[styles.sizeChip, on && styles.sizeChipOn]}
                  >
                    <Box size={16} color={on ? colors.white : colors.brand.red} />
                    <Text style={[styles.sizeChipText, on && { color: colors.white }]}>
                      {SIZE_LABEL[s]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
        <AddButton
          label="إضافة أوردر آخر"
          onPress={() =>
            setOrders((p) => [
              ...p,
              {
                id: newId(),
                customerName: '',
                customerPhone: '',
                customerAddress: '',
                size: 'BAG',
              },
            ])
          }
        />

        <View style={styles.noteBox}>
          <Text style={styles.noteText}>
            سعر التوصيل يُحدَّد من الإدارة حسب المسافة بين عنوان التاجر وكل عميل.
          </Text>
        </View>

        <View style={{ height: 90 }} />
      </ScrollView>

      <View style={styles.footer}>
        <GradientButton
          label={submit.isPending ? 'جاري الإرسال…' : 'إرسال الطلب للإدارة'}
          onPress={() => submit.mutate()}
          disabled={!canSubmit || submit.isPending}
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
  Icon: typeof Store;
  title: string;
  count?: number;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIcon}>
        <Icon size={16} color={colors.brand.red} />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
      {count !== undefined && count > 0 ? (
        <View style={styles.countPill}>
          <Text style={styles.countPillText}>{count}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Field({
  Icon,
  last,
  ...props
}: React.ComponentProps<typeof TextInput> & { Icon: typeof User; last?: boolean }) {
  return (
    <View style={[styles.fieldWrap, last && { marginBottom: 0 }]}>
      <Icon size={18} color={colors.brand.red} />
      <TextInput placeholderTextColor={colors.text.muted} style={styles.fieldInput} {...props} />
    </View>
  );
}

function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
    >
      <Plus size={18} color={colors.brand.red} />
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
  sectionTitle: { fontSize: fontSizes.md, fontFamily: fontFamilies.headingBold, color: colors.ink },
  countPill: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: colors.brand.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countPillText: {
    color: colors.white,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
  },
  repeater: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  repeaterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  repeaterTitle: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.brand.red,
  },
  fieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    minHeight: 46,
    marginBottom: spacing.sm,
  },
  fieldInput: {
    flex: 1,
    fontSize: fontSizes.sm,
    color: colors.ink,
    fontFamily: fontFamilies.body,
    textAlign: 'right',
  },
  sizeLabel: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyBold,
    color: colors.text.secondary,
    marginBottom: 6,
    marginTop: 2,
  },
  sizeRow: { flexDirection: 'row', gap: spacing.sm },
  sizeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
  },
  sizeChipOn: { backgroundColor: colors.brand.red, borderColor: colors.brand.red },
  sizeChipText: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyBold, color: colors.ink },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand.redLight,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  addBtnText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.brand.red,
  },
  noteBox: {
    backgroundColor: colors.brand.gold + '18',
    borderRadius: radii.md,
    padding: spacing.md,
  },
  noteText: {
    fontSize: fontSizes.xs,
    color: colors.brand.dark,
    fontFamily: fontFamilies.body,
    lineHeight: 20,
    textAlign: 'center',
  },
  footer: {
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
});
