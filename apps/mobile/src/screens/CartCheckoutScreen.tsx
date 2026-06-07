/**
 * Cart checkout — confirms a multi-merchant cart in a single screen.
 *
 *   - Address picker (single, applies to every sub-order)
 *   - Schedule picker (single)
 *   - Payment method picker (single)
 *   - Per-merchant section: items snapshot + optional notes + image upload
 *   - Sticky bottom: grand total + "تأكيد الطلب"
 *
 * On submit we POST to /orders/cart, which fans the request out into one
 * parent order + N children server-side (see orders.cart.controller.ts).
 * On success the customer lands on OrderTracking for the parent order.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';
import { Calendar, Camera, Clock, Package, Store, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddressPicker, type PickedAddress } from '../components/AddressPicker';
import { PaymentMethodPicker, type PaymentMethod } from '../components/PaymentMethodPicker';
import { ScreenHeader } from '../components/ScreenHeader';
import { SchedulePicker } from '../components/SchedulePicker';
import { EmptyState, MoneyText, PrimaryButton } from '../components/ui';
import { api } from '../lib/api';
import { showToast } from '../lib/toast';
import { uploadFile } from '../lib/uploadFile';
import type { HomeStackParamList } from '../navigation/HomeStack';
import { clearCart, getMerchantGroups, useCart } from '../stores/cart';
import { palette, typography } from '../theme/tokens';
import { colors, fontFamilies, fontSizes, radii, shadows, spacing } from '../theme/tokens';

type NavProp = NativeStackNavigationProp<HomeStackParamList, 'CartCheckout'>;

interface MerchantExtras {
  notes: string;
  imageUrls: string[];
}

export function CartCheckoutScreen() {
  const navigation = useNavigation<NavProp>();
  const cart = useCart();
  const groups = useMemo(() => getMerchantGroups(cart), [cart]);

  const [address, setAddress] = useState<PickedAddress | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false);
  const [extras, setExtras] = useState<Record<string, MerchantExtras>>({});

  const getExtras = (merchantId: string): MerchantExtras =>
    extras[merchantId] ?? { notes: '', imageUrls: [] };

  const setExtrasFor = (merchantId: string, patch: Partial<MerchantExtras>): void => {
    setExtras((prev) => ({
      ...prev,
      [merchantId]: { ...getExtras(merchantId), ...patch },
    }));
  };

  const submitOrder = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.raw.post('/orders/cart', payload).then((r) => r.data.data),
    onSuccess: (order) => {
      clearCart();
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
      showToast({ title: 'تم إنشاء طلبك بنجاح', tone: 'success' });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'تعذّر إنشاء الطلب، حاول لاحقاً';
      showToast({ title: 'فشل إنشاء الطلب', message, tone: 'error' });
    },
  });

  const onSubmit = (): void => {
    if (!address || !address.address) {
      showToast({ title: 'أدخل عنوان التوصيل أولاً', tone: 'error' });
      return;
    }
    if (address.lat == null || address.lng == null) {
      showToast({
        title: 'لا يمكن استخدام هذا العنوان',
        message: 'اختر عنوان محفوظ أو استخدم موقعك الحالي',
        tone: 'error',
      });
      return;
    }
    const merchants = groups.map((g) => {
      const extra = getExtras(g.merchantId);
      return {
        merchantId: g.merchantId,
        items: g.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        notes: extra.notes.trim() || undefined,
        imageUrls: extra.imageUrls.length > 0 ? extra.imageUrls : undefined,
      };
    });
    void submitOrder.mutateAsync({
      deliveryAddress: address.address,
      deliveryLat: address.lat,
      deliveryLng: address.lng,
      paymentMethod,
      scheduledFor: scheduledFor ?? undefined,
      merchants,
    });
  };

  if (cart.items.length === 0) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScreenHeader title="إتمام الطلب" />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState title="السلة فارغة" subtitle="أضف منتجات للسلة قبل تأكيد الطلب" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader
        title="إتمام الطلب"
        subtitle={groups.length > 1 ? `${groups.length} تجار في طلب واحد` : undefined}
      />

      <ScrollView contentContainerStyle={styles.scrollPad} showsVerticalScrollIndicator={false}>
        {/* ─────── Per-merchant blocks ─────── */}
        {groups.map((group) => {
          const extra = getExtras(group.merchantId);
          return (
            <View key={group.merchantId} style={styles.merchantBlock}>
              <View style={styles.merchantStrip}>
                <View style={styles.merchantIcon}>
                  <Store size={16} color={colors.brand.red} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.merchantLabel}>المتجر</Text>
                  <Text style={styles.merchantName} numberOfLines={1}>
                    {group.merchantNameAr}
                  </Text>
                </View>
                <View style={styles.merchantTotalPill}>
                  <MoneyText amount={group.subtotal} tone="brand" size="sm" />
                </View>
              </View>

              {/* Items snapshot */}
              {group.items.map((item) => (
                <View key={item.productId} style={[styles.lineItem, shadows.sm]}>
                  <View style={styles.thumb}>
                    {item.imageUrl ? (
                      <Image
                        source={{ uri: item.imageUrl }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    ) : (
                      <Package size={18} color={colors.brand.red} />
                    )}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.itemName} numberOfLines={2}>
                      {item.nameAr}
                    </Text>
                    <View style={styles.itemMeta}>
                      <MoneyText amount={item.price} size="sm" />
                      <Text style={styles.itemMultiplier}>× {item.quantity}</Text>
                    </View>
                  </View>
                </View>
              ))}

              {/* Per-merchant optional details */}
              <Text style={styles.detailsLabel}>ملاحظات خاصة بهذا المتجر (اختياري)</Text>
              <TextInput
                value={extra.notes}
                onChangeText={(t) => setExtrasFor(group.merchantId, { notes: t })}
                placeholder="مثال: ضيف لي علبة تونة، استبدل أي صنف ناقص بالمتاح..."
                placeholderTextColor={colors.text.muted}
                multiline
                numberOfLines={3}
                style={styles.notesInput}
              />

              {/* Per-merchant image upload */}
              <Text style={styles.detailsLabel}>صور (اختياري)</Text>
              <View style={styles.imageRow}>
                {extra.imageUrls.map((url) => (
                  <View key={url} style={styles.imagePreviewWrap}>
                    <Image source={{ uri: url }} style={styles.imagePreview} />
                    <Pressable
                      onPress={() =>
                        setExtrasFor(group.merchantId, {
                          imageUrls: extra.imageUrls.filter((u) => u !== url),
                        })
                      }
                      style={styles.imageRemoveBtn}
                      hitSlop={4}
                    >
                      <X size={12} color={colors.white} />
                    </Pressable>
                  </View>
                ))}
                {extra.imageUrls.length < 3 && (
                  <Pressable
                    onPress={async () => {
                      try {
                        const ImagePicker = await import('expo-image-picker');
                        const result = await ImagePicker.launchImageLibraryAsync({
                          mediaTypes: ['images'],
                          quality: 0.85,
                        });
                        if (result.canceled || !result.assets?.[0]) return;
                        const uploaded = await uploadFile(result.assets[0].uri, {
                          mime: 'image/jpeg',
                        });
                        if (!uploaded?.url) throw new Error('فشل رفع الصورة');
                        setExtrasFor(group.merchantId, {
                          imageUrls: [...extra.imageUrls, uploaded.url],
                        });
                      } catch (err) {
                        showToast({
                          title: 'فشل رفع الصورة',
                          message: err instanceof Error ? err.message : undefined,
                          tone: 'error',
                        });
                      }
                    }}
                    style={({ pressed }) => [styles.uploadBtn, pressed && { opacity: 0.7 }]}
                  >
                    <Camera size={18} color={colors.brand.red} />
                    <Text style={styles.uploadLabel}>إضافة صورة</Text>
                    <Text style={styles.uploadCount}>{extra.imageUrls.length}/3</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}

        {/* ─────── Shared address ─────── */}
        <Text style={styles.sectionTitle}>عنوان التوصيل</Text>
        <AddressPicker value={address} onChange={setAddress} />

        {/* ─────── Schedule ─────── */}
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

        {/* ─────── Payment ─────── */}
        <Text style={styles.sectionTitle}>طريقة الدفع</Text>
        <PaymentMethodPicker value={paymentMethod} onChange={setPaymentMethod} />

        {/* ─────── Grand total card ─────── */}
        <View style={[styles.totalCard, shadows.sm]}>
          {groups.map((g) => (
            <View key={g.merchantId} style={styles.totalLine}>
              <Text style={styles.totalLineLabel} numberOfLines={1}>
                {g.merchantNameAr}
              </Text>
              <MoneyText amount={g.subtotal} size="sm" />
            </View>
          ))}
          <View style={styles.totalDivider} />
          <View style={styles.totalLine}>
            <Text style={styles.grandTotalLabel}>الإجمالي الكلي</Text>
            <MoneyText amount={cart.subtotal} size="lg" tone="brand" />
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Sticky bottom: confirm */}
      <View style={[styles.footer, shadows.lg]}>
        <PrimaryButton
          label={submitOrder.isPending ? 'جاري الإرسال…' : 'تأكيد الطلب'}
          onPress={onSubmit}
          loading={submitOrder.isPending}
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
  scrollPad: { padding: spacing.lg },
  sectionTitle: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.headingBlack,
    color: colors.text.muted,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Merchant block
  merchantBlock: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  merchantStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  merchantIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  merchantLabel: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
  },
  merchantName: {
    fontSize: fontSizes.md,
    color: colors.ink,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  merchantTotalPill: {
    backgroundColor: colors.brand.redLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.md,
  },
  // Line items
  lineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radii.sm,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  itemName: { fontFamily: fontFamilies.bodyBold, color: colors.ink, fontSize: fontSizes.sm },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemMultiplier: {
    color: colors.text.muted,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
  },
  // Per-merchant details
  detailsLabel: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyBold,
    color: colors.text.muted,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  notesInput: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.sm,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.body,
    color: colors.ink,
    minHeight: 70,
    textAlignVertical: 'top',
    textAlign: 'right',
  },
  imageRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  imagePreviewWrap: { position: 'relative' },
  imagePreview: { width: 60, height: 60, borderRadius: radii.md, backgroundColor: colors.surface },
  imageRemoveBtn: {
    position: 'absolute',
    top: -6,
    insetInlineEnd: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadBtn: {
    width: 80,
    height: 60,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.brand.red,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  uploadLabel: { fontSize: 10, color: colors.brand.red, fontFamily: fontFamilies.bodyBold },
  uploadCount: { fontSize: 9, color: colors.text.muted, fontFamily: fontFamilies.body },
  // Schedule
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
  },
  scheduleIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Grand total card
  totalCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  totalLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  totalLineLabel: {
    fontFamily: fontFamilies.body,
    color: colors.text.secondary,
    fontSize: fontSizes.sm,
    flex: 1,
    marginInlineEnd: spacing.sm,
  },
  totalDivider: { height: 1, backgroundColor: colors.line, marginVertical: spacing.xs },
  grandTotalLabel: {
    fontFamily: fontFamilies.headingBlack,
    color: colors.ink,
    fontSize: fontSizes.md,
  },
  // Sticky footer
  footer: {
    position: 'absolute',
    insetInlineStart: 0,
    insetInlineEnd: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    padding: spacing.md,
  },
});
