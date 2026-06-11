/**
 * MerchantOrderDetailScreen
 *
 * Full-page detail view for a single merchant order. Pulled by id via
 * `/merchant/orders/:id`. Shows: order number + status pill in the header,
 * customer contact card, line items, delivery address, totals breakdown,
 * driver block (when assigned), and accept/reject CTAs when the status
 * still allows it (PENDING).
 *
 * Independent of the customer order screens — no shared components are
 * imported from there. Phone numbers are tappable via `Linking.openURL`.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, Check, MapPin, Package, Phone, Receipt, User, X } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../lib/api';
import { showToast } from '../../lib/toast';
import { colors, fontFamilies, fontSizes, radii, shadows, spacing } from '../../theme/tokens';

// Imported type-only so this file compiles before the navigation agent
// creates the merchant stack. Param name + shape: `{ orderId: string }`.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { MerchantStackParamList } from '../../navigation/MerchantStack';

type Props = NativeStackScreenProps<MerchantStackParamList, 'MerchantOrderDetail'>;

type MerchantOrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'PICKED_UP'
  | 'IN_ROUTE'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED';

interface OrderItem {
  id: string;
  name?: string | null;
  nameAr?: string | null;
  quantity: number;
  unitPrice?: number | null;
  total?: number | null;
  unit?: string | null;
}

interface MerchantOrderDetail {
  id: string;
  orderNumber: string;
  status: MerchantOrderStatus;
  createdAt: string;
  customerName?: string | null;
  customerPhone?: string | null;
  addressLine?: string | null;
  governorate?: string | null;
  items?: OrderItem[] | null;
  subtotal?: number | null;
  deliveryFee?: number | null;
  total?: number | null;
  driverName?: string | null;
  driverPhone?: string | null;
  rejectionReason?: string | null;
}

const STATUS_LABEL: Record<MerchantOrderStatus, string> = {
  PENDING: 'قيد الانتظار',
  ACCEPTED: 'مقبول',
  PREPARING: 'قيد التحضير',
  READY: 'جاهز',
  PICKED_UP: 'تم الاستلام',
  IN_ROUTE: 'في الطريق',
  DELIVERED: 'تم التسليم',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي',
  REJECTED: 'مرفوض',
};

const STATUS_COLOR: Record<MerchantOrderStatus, string> = {
  PENDING: colors.brand.gold,
  ACCEPTED: colors.success,
  PREPARING: colors.info,
  READY: colors.info,
  PICKED_UP: colors.brand.gold,
  IN_ROUTE: colors.brand.gold,
  DELIVERED: colors.success,
  COMPLETED: colors.success,
  CANCELLED: colors.text.muted,
  REJECTED: colors.danger,
};

function fmtMoney(value: number | null | undefined): string {
  return `${Number(value ?? 0).toLocaleString('ar-EG')} ج.م`;
}

function callPhone(phone: string | null | undefined) {
  if (!phone) return;
  const url = `tel:${phone}`;
  Linking.canOpenURL(url)
    .then((ok) => {
      if (ok) return Linking.openURL(url);
      Alert.alert('غير متاح', 'تعذّر فتح تطبيق الاتصال على هذا الجهاز.');
      return undefined;
    })
    .catch(() => {
      Alert.alert('غير متاح', 'تعذّر فتح تطبيق الاتصال على هذا الجهاز.');
    });
}

export function MerchantOrderDetailScreen({ route }: Props) {
  const { orderId } = route.params;
  const qc = useQueryClient();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const query = useQuery<MerchantOrderDetail>({
    queryKey: ['merchant', 'orders', orderId],
    queryFn: async () => {
      const res = await api.raw.get(`/merchant/orders/${orderId}`);
      return res.data.data as MerchantOrderDetail;
    },
    staleTime: 5 * 60 * 1000,
  });

  const reportError = (err: unknown, fallback: string) => {
    const message = err instanceof Error ? err.message : fallback;
    try {
      showToast({ title: fallback, message, tone: 'error' });
    } catch {
      Alert.alert(fallback, message);
    }
  };

  const acceptMut = useMutation({
    mutationFn: () => api.raw.patch(`/merchant/orders/${orderId}/accept`),
    onSuccess: () => {
      showToast({ title: 'تم قبول الطلب', tone: 'success' });
      void qc.invalidateQueries({ queryKey: ['merchant', 'orders'] });
      void qc.invalidateQueries({ queryKey: ['merchant', 'orders', orderId] });
      void qc.invalidateQueries({ queryKey: ['merchant', 'me'] });
    },
    onError: (err) => reportError(err, 'تعذّر قبول الطلب'),
  });

  const rejectMut = useMutation({
    mutationFn: (reason: string) => api.raw.patch(`/merchant/orders/${orderId}/reject`, { reason }),
    onSuccess: () => {
      showToast({ title: 'تم رفض الطلب', tone: 'success' });
      setRejectOpen(false);
      setRejectReason('');
      void qc.invalidateQueries({ queryKey: ['merchant', 'orders'] });
      void qc.invalidateQueries({ queryKey: ['merchant', 'orders', orderId] });
      void qc.invalidateQueries({ queryKey: ['merchant', 'me'] });
    },
    onError: (err) => reportError(err, 'تعذّر رفض الطلب'),
  });

  const submitReject = () => {
    const reason = rejectReason.trim();
    if (!reason) {
      Alert.alert('سبب الرفض مطلوب', 'برجاء كتابة سبب رفض الطلب حتى يصل للعميل.');
      return;
    }
    rejectMut.mutate(reason);
  };

  if (query.isLoading) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand.red} />
        </View>
      </SafeAreaView>
    );
  }

  const data = query.data;
  if (!data) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={styles.loading}>
          <Text style={styles.errorTitle}>تعذّر تحميل الطلب</Text>
          <Pressable onPress={() => query.refetch()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>إعادة المحاولة</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const statusColor = STATUS_COLOR[data.status];
  const statusLabel = STATUS_LABEL[data.status];
  const canDecide = data.status === 'PENDING';
  const items = data.items ?? [];

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.headerOrderNumber}>#{data.orderNumber}</Text>
            <View
              style={[
                styles.statusPill,
                { backgroundColor: statusColor + '18', borderColor: statusColor + '40' },
              ]}
            >
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusPillText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>
          <Text style={styles.headerDate}>
            {new Date(data.createdAt).toLocaleString('ar-EG', {
              day: 'numeric',
              month: 'long',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>

        {data.rejectionReason ? (
          <View style={[styles.section, styles.rejectBanner]}>
            <Text style={styles.rejectTitle}>سبب الرفض</Text>
            <Text style={styles.rejectMessage}>{data.rejectionReason}</Text>
          </View>
        ) : null}

        {/* Customer */}
        <SectionCard Icon={User} title="بيانات العميل">
          <Text style={styles.sectionPrimary}>{data.customerName ?? 'عميل'}</Text>
          {data.customerPhone ? (
            <Pressable
              onPress={() => callPhone(data.customerPhone)}
              style={({ pressed }) => [styles.phoneRow, pressed && { opacity: 0.85 }]}
            >
              <Phone size={14} color={colors.brand.red} />
              <Text style={styles.phoneText}>{data.customerPhone}</Text>
            </Pressable>
          ) : null}
        </SectionCard>

        {/* Items */}
        <SectionCard Icon={Package} title="المنتجات">
          {items.length === 0 ? (
            <Text style={styles.muted}>لا توجد عناصر مسجلة</Text>
          ) : (
            items.map((it, idx) => (
              <View
                key={it.id}
                style={[
                  styles.itemRow,
                  idx < items.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: colors.line,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName} numberOfLines={2}>
                    {it.nameAr || it.name || 'منتج'}
                  </Text>
                  <Text style={styles.itemMeta}>
                    {Number(it.quantity ?? 0).toLocaleString('ar-EG')}
                    {it.unit ? ` ${it.unit}` : ''} × {fmtMoney(it.unitPrice)}
                  </Text>
                </View>
                <Text style={styles.itemTotal}>
                  {fmtMoney(it.total ?? (it.unitPrice ?? 0) * it.quantity)}
                </Text>
              </View>
            ))
          )}
        </SectionCard>

        {/* Address */}
        <SectionCard Icon={MapPin} title="عنوان التوصيل">
          <Text style={styles.sectionPrimary}>{data.addressLine ?? 'غير محدد'}</Text>
          {data.governorate ? <Text style={styles.muted}>{data.governorate}</Text> : null}
        </SectionCard>

        {/* Driver (if assigned) */}
        {data.driverName || data.driverPhone ? (
          <SectionCard Icon={Bike} title="السائق">
            {data.driverName ? <Text style={styles.sectionPrimary}>{data.driverName}</Text> : null}
            {data.driverPhone ? (
              <Pressable
                onPress={() => callPhone(data.driverPhone)}
                style={({ pressed }) => [styles.phoneRow, pressed && { opacity: 0.85 }]}
              >
                <Phone size={14} color={colors.brand.red} />
                <Text style={styles.phoneText}>{data.driverPhone}</Text>
              </Pressable>
            ) : null}
          </SectionCard>
        ) : null}

        {/* Totals */}
        <SectionCard Icon={Receipt} title="ملخص الفاتورة">
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>المجموع الفرعي</Text>
            <Text style={styles.totalsValue}>{fmtMoney(data.subtotal)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>رسوم التوصيل</Text>
            <Text style={styles.totalsValue}>{fmtMoney(data.deliveryFee)}</Text>
          </View>
          <View style={[styles.totalsRow, styles.totalsGrand]}>
            <Text style={styles.totalsGrandLabel}>الإجمالي</Text>
            <Text style={styles.totalsGrandValue}>{fmtMoney(data.total)}</Text>
          </View>
        </SectionCard>

        {canDecide ? (
          <View style={styles.ctaRow}>
            <Pressable
              disabled={rejectMut.isPending || acceptMut.isPending}
              onPress={() => setRejectOpen(true)}
              style={({ pressed }) => [
                styles.ctaBtn,
                styles.ctaReject,
                (pressed || rejectMut.isPending || acceptMut.isPending) && { opacity: 0.85 },
              ]}
            >
              <X size={18} color={colors.white} />
              <Text style={styles.ctaText}>رفض</Text>
            </Pressable>
            <Pressable
              disabled={rejectMut.isPending || acceptMut.isPending}
              onPress={() => acceptMut.mutate()}
              style={({ pressed }) => [
                styles.ctaBtn,
                styles.ctaAccept,
                (pressed || rejectMut.isPending || acceptMut.isPending) && { opacity: 0.85 },
              ]}
            >
              <Check size={18} color={colors.white} />
              <Text style={styles.ctaText}>
                {acceptMut.isPending ? 'جارٍ القبول…' : 'قبول الطلب'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={rejectOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, shadows.xl]}>
            <Text style={styles.modalTitle}>سبب رفض الطلب</Text>
            <Text style={styles.modalSubtitle}>
              برجاء توضيح السبب حتى يصل للعميل عند رفض الطلب.
            </Text>
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="اكتب سبب الرفض هنا…"
              placeholderTextColor={colors.text.placeholder}
              style={styles.modalInput}
              multiline
              textAlign="right"
              textAlignVertical="top"
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setRejectOpen(false);
                  setRejectReason('');
                }}
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalCancel,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.modalCancelText}>إلغاء</Text>
              </Pressable>
              <Pressable
                onPress={submitReject}
                disabled={rejectMut.isPending}
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalConfirm,
                  (pressed || rejectMut.isPending) && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.modalConfirmText}>
                  {rejectMut.isPending ? 'جارٍ الإرسال…' : 'تأكيد الرفض'}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function SectionCard({
  Icon,
  title,
  children,
}: {
  Icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.section, shadows.sm]}>
      <View style={styles.sectionHead}>
        <View style={styles.sectionHeadIcon}>
          <Icon size={16} color={colors.brand.red} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { paddingBottom: spacing.xxl },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  errorTitle: {
    fontFamily: fontFamilies.headingBold,
    color: colors.ink,
    fontSize: fontSizes.md,
  },
  retryBtn: {
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.brand.redLight,
  },
  retryBtnText: {
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.sm,
    color: colors.brand.red,
  },
  // Header
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headerOrderNumber: {
    fontFamily: fontFamilies.headingBlack,
    fontSize: fontSizes.xl,
    color: colors.ink,
  },
  headerDate: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.xs,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: {
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.xs,
  },
  // Section card
  section: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionHeadIcon: {
    width: 30,
    height: 30,
    borderRadius: radii.sm,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.md,
    color: colors.ink,
  },
  sectionBody: { gap: spacing.xs },
  sectionPrimary: {
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
    fontSize: fontSizes.md,
  },
  muted: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.sm,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.xs,
  },
  phoneText: {
    fontFamily: fontFamilies.bodyBold,
    color: colors.brand.red,
    fontSize: fontSizes.sm,
  },
  // Rejection banner
  rejectBanner: {
    backgroundColor: colors.dangerLight,
    borderColor: colors.danger + '40',
    gap: 4,
  },
  rejectTitle: {
    fontFamily: fontFamilies.headingBold,
    color: colors.danger,
    fontSize: fontSizes.sm,
  },
  rejectMessage: {
    fontFamily: fontFamilies.body,
    color: colors.text.secondary,
    fontSize: fontSizes.sm,
  },
  // Items
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  itemName: {
    fontFamily: fontFamilies.bodyBold,
    color: colors.ink,
    fontSize: fontSizes.sm,
  },
  itemMeta: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  itemTotal: {
    fontFamily: fontFamilies.headingBold,
    color: colors.ink,
    fontSize: fontSizes.sm,
  },
  // Totals
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  totalsLabel: {
    fontFamily: fontFamilies.body,
    color: colors.text.secondary,
    fontSize: fontSizes.sm,
  },
  totalsValue: {
    fontFamily: fontFamilies.bodyBold,
    color: colors.ink,
    fontSize: fontSizes.sm,
  },
  totalsGrand: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  totalsGrandLabel: {
    fontFamily: fontFamilies.headingBold,
    color: colors.ink,
    fontSize: fontSizes.md,
  },
  totalsGrandValue: {
    fontFamily: fontFamilies.headingBlack,
    color: colors.brand.red,
    fontSize: fontSizes.lg,
  },
  // CTAs
  ctaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  ctaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: radii.md,
  },
  ctaAccept: { backgroundColor: colors.success },
  ctaReject: { backgroundColor: colors.danger },
  ctaText: {
    color: colors.white,
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.md,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.alpha.black60,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: {
    fontFamily: fontFamilies.headingBlack,
    color: colors.ink,
    fontSize: fontSizes.lg,
  },
  modalSubtitle: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.sm,
  },
  modalInput: {
    minHeight: 96,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.ink,
    writingDirection: 'rtl',
  },
  modalActions: { flexDirection: 'row', gap: spacing.sm },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  modalCancel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  modalCancelText: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
    color: colors.ink,
  },
  modalConfirm: { backgroundColor: colors.danger },
  modalConfirmText: {
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.sm,
    color: colors.white,
  },
});
