/**
 * MerchantOrdersListScreen
 *
 * Order inbox for the MERCHANT role. Fetches from `/merchant/orders` and
 * renders a list of compact OrderCard rows with status pills. Pending
 * orders surface two big inline CTAs — قبول (accept, green) and رفض
 * (reject, red) — wired to PATCH endpoints; reject opens a reason input
 * modal before sending. Tapping a row navigates to `MerchantOrderDetail`
 * via the merchant stack.
 *
 * Standalone: no imports from customer screens. Toasts surface from
 * `lib/toast`; on failure we fall back to `Alert.alert` so the merchant
 * never silently loses an error.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardList, X } from 'lucide-react-native';
import { memo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../lib/api';
import { LIST_PERF } from '../../lib/listPerf';
import { showToast } from '../../lib/toast';
import { colors, fontFamilies, fontSizes, radii, shadows, spacing } from '../../theme/tokens';

// The MerchantStack module is created by the navigation agent. We import it
// type-only so this file compiles even before the file lands; the navigation
// agent will add the `MerchantOrderDetail` entry to the param list.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { MerchantStackParamList } from '../../navigation/MerchantStack';

type Nav = NativeStackNavigationProp<MerchantStackParamList, 'MerchantOrdersList'>;

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

interface MerchantOrder {
  id: string;
  orderNumber: string;
  status: MerchantOrderStatus;
  total?: number | null;
  customerName?: string | null;
  itemsCount?: number | null;
  createdAt: string;
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

function formatCurrency(value: number | null | undefined): string {
  return `${Number(value ?? 0).toLocaleString('ar-EG')} ج.م`;
}

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleDateString('ar-EG', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

interface OrderRowProps {
  item: MerchantOrder;
  onPress: (id: string) => void;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  busy: boolean;
}

const OrderRow = memo(function OrderRow({
  item,
  onPress,
  onAccept,
  onReject,
  busy,
}: OrderRowProps) {
  const statusColor = STATUS_COLOR[item.status];
  const statusLabel = STATUS_LABEL[item.status];
  const isPending = item.status === 'PENDING';

  return (
    <Pressable
      onPress={() => onPress(item.id)}
      style={({ pressed }) => [styles.card, shadows.sm, pressed && { opacity: 0.94 }]}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardOrderNumber} numberOfLines={1}>
          #{item.orderNumber}
        </Text>
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

      <View style={styles.cardMetaRow}>
        <Text style={styles.cardCustomer} numberOfLines={1}>
          {item.customerName ?? 'عميل'}
        </Text>
        <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
      </View>

      <View style={styles.cardBottom}>
        <Text style={styles.cardItems}>
          {Number(item.itemsCount ?? 0).toLocaleString('ar-EG')} منتج
        </Text>
        <Text style={styles.cardTotal}>{formatCurrency(item.total)}</Text>
      </View>

      {isPending ? (
        <View style={styles.actionRow}>
          <Pressable
            disabled={busy}
            onPress={(e) => {
              e.stopPropagation();
              onReject(item.id);
            }}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.rejectBtn,
              (pressed || busy) && { opacity: 0.85 },
            ]}
          >
            <X size={18} color={colors.white} />
            <Text style={styles.actionBtnText}>رفض</Text>
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={(e) => {
              e.stopPropagation();
              onAccept(item.id);
            }}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.acceptBtn,
              (pressed || busy) && { opacity: 0.85 },
            ]}
          >
            <Check size={18} color={colors.white} />
            <Text style={styles.actionBtnText}>قبول</Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
});

export function MerchantOrdersListScreen() {
  const navigation = useNavigation<Nav>();
  const qc = useQueryClient();

  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const ordersQuery = useQuery<MerchantOrder[]>({
    queryKey: ['merchant', 'orders'],
    queryFn: async () => {
      const res = await api.raw.get('/merchant/orders');
      return (res.data.data ?? []) as MerchantOrder[];
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
    mutationFn: (orderId: string) => api.raw.patch(`/merchant/orders/${orderId}/accept`),
    onSuccess: () => {
      showToast({ title: 'تم قبول الطلب', tone: 'success' });
      void qc.invalidateQueries({ queryKey: ['merchant', 'orders'] });
      void qc.invalidateQueries({ queryKey: ['merchant', 'me'] });
    },
    onError: (err) => reportError(err, 'تعذّر قبول الطلب'),
  });

  const rejectMut = useMutation({
    mutationFn: (vars: { orderId: string; reason: string }) =>
      api.raw.patch(`/merchant/orders/${vars.orderId}/reject`, { reason: vars.reason }),
    onSuccess: () => {
      showToast({ title: 'تم رفض الطلب', tone: 'success' });
      setRejectFor(null);
      setRejectReason('');
      void qc.invalidateQueries({ queryKey: ['merchant', 'orders'] });
      void qc.invalidateQueries({ queryKey: ['merchant', 'me'] });
    },
    onError: (err) => reportError(err, 'تعذّر رفض الطلب'),
  });

  const openOrder = (id: string) => {
    // The navigation agent registers MerchantOrderDetail in MerchantStack.
    navigation.navigate('MerchantOrderDetail', { orderId: id });
  };

  const onAccept = (id: string) => acceptMut.mutate(id);

  const onRejectPress = (id: string) => {
    setRejectFor(id);
    setRejectReason('');
  };

  const submitReject = () => {
    if (!rejectFor) return;
    const reason = rejectReason.trim();
    if (!reason) {
      Alert.alert('سبب الرفض مطلوب', 'برجاء كتابة سبب رفض الطلب حتى يصل للعميل.');
      return;
    }
    rejectMut.mutate({ orderId: rejectFor, reason });
  };

  const data = ordersQuery.data ?? [];
  const busyId =
    (acceptMut.isPending ? acceptMut.variables : null) ??
    (rejectMut.isPending ? rejectMut.variables?.orderId : null) ??
    null;

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>طلبات المتجر</Text>
        <Text style={styles.headerCount}>{Number(data.length).toLocaleString('ar-EG')} طلب</Text>
      </View>

      <FlatList
        {...LIST_PERF}
        data={data}
        keyExtractor={(o) => o.id}
        contentContainerStyle={[
          styles.listPad,
          data.length === 0 && { flexGrow: 1, justifyContent: 'center' },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={ordersQuery.isFetching && !ordersQuery.isLoading}
            onRefresh={() => {
              // RefreshControl expects a void-returning handler — discard
              // the refetch promise and surface errors via toast instead
              // of letting them silently reject.
              ordersQuery.refetch().catch((err) => {
                const message = err instanceof Error ? err.message : undefined;
                showToast({ title: 'تعذّر تحديث الطلبات', message, tone: 'error' });
              });
            }}
            tintColor={colors.brand.red}
          />
        }
        renderItem={({ item }) => (
          <OrderRow
            item={item}
            onPress={openOrder}
            onAccept={onAccept}
            onReject={onRejectPress}
            busy={busyId === item.id}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <ClipboardList size={28} color={colors.brand.red} />
            </View>
            <Text style={styles.emptyTitle}>لا توجد طلبات حاليًا</Text>
            <Text style={styles.emptySubtitle}>ستظهر هنا فور وصول طلبات جديدة لمتجرك.</Text>
          </View>
        }
      />

      {/* Reject reason modal */}
      <Modal
        visible={rejectFor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectFor(null)}
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
                  setRejectFor(null);
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontFamily: fontFamilies.headingBlack,
    fontSize: fontSizes.xl,
    color: colors.ink,
  },
  headerCount: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xs,
    color: colors.text.muted,
  },
  listPad: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  // Order card
  card: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardOrderNumber: {
    flex: 1,
    fontFamily: fontFamilies.headingBold,
    color: colors.ink,
    fontSize: fontSizes.md,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: {
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.xs,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  cardCustomer: {
    flex: 1,
    fontFamily: fontFamilies.bodyBold,
    color: colors.text.secondary,
    fontSize: fontSizes.sm,
  },
  cardDate: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.xs,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  cardItems: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.xs,
  },
  cardTotal: {
    fontFamily: fontFamilies.headingBlack,
    color: colors.brand.red,
    fontSize: fontSizes.lg,
  },
  // Pending action buttons
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radii.md,
  },
  acceptBtn: { backgroundColor: colors.success },
  rejectBtn: { backgroundColor: colors.danger },
  actionBtnText: {
    color: colors.white,
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.md,
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: radii.xl,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontFamily: fontFamilies.headingBlack,
    color: colors.ink,
    fontSize: fontSizes.lg,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.sm,
    textAlign: 'center',
  },
  // Reject modal
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
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
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
