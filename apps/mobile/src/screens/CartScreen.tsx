/**
 * Cart screen — items the customer queued from product detail, grouped
 * by merchant. Each merchant section has its own subtotal and "clear"
 * button so the customer can prune one store without nuking the others.
 *
 * Sticky bottom shows the grand total across all merchants + the
 * "إتمام الطلب" CTA that opens the dedicated checkout screen.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { Minus, Package, Plus, ShoppingBag, Store, Trash2 } from 'lucide-react-native';
import { useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/ScreenHeader';
import { EmptyState, MoneyText, PrimaryButton } from '../components/ui';
import { api } from '../lib/api';
import { confirm } from '../lib/confirm';
import { haptic } from '../lib/haptics';
import type { HomeStackParamList } from '../navigation/HomeStack';
import {
  clearCart,
  clearMerchant,
  getMerchantGroups,
  removeFromCart,
  setItemQuantity,
  useCart,
} from '../stores/cart';
import { colors, fontFamilies, fontSizes, radii, shadows, spacing } from '../theme/tokens';

type NavProp = NativeStackNavigationProp<HomeStackParamList, 'Cart'>;

interface OpennessInfo {
  isOpenNow: boolean;
  message?: string | null;
}

export function CartScreen() {
  const navigation = useNavigation<NavProp>();
  const cart = useCart();
  const groups = useMemo(() => getMerchantGroups(cart), [cart]);

  // Live openness for every merchant in the cart — refreshes every minute
  // so a section that opens / closes is reflected without manual refresh.
  const merchantIds = cart.merchantIds;
  const { data: openness } = useQuery<Record<string, OpennessInfo>>({
    queryKey: ['cart-openness', merchantIds.join(',')],
    enabled: merchantIds.length > 0,
    queryFn: async () => {
      const r = await api.raw.post('/merchants/openness', { ids: merchantIds });
      return r.data.data ?? {};
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const anyClosed = !!openness && Object.values(openness).some((o) => !o.isOpenNow);

  // ── Empty cart ──────────────────────────────────────────────────────
  if (cart.items.length === 0) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScreenHeader title="سلتي" subtitle="منتجاتك قبل تأكيد الطلب" />
        <View style={styles.emptyWrap}>
          <EmptyState
            icon={<ShoppingBag size={36} color={colors.brand.red} />}
            title="السلة فارغة"
            subtitle="ابدأ بإضافة منتجات من المتاجر القريبة منك"
            actionLabel="تصفّح المتاجر"
            onAction={() => navigation.navigate('StoresList')}
          />
        </View>
      </SafeAreaView>
    );
  }

  const onClearAll = () => {
    confirm('إفراغ السلة', 'هل تريد حذف كل المنتجات من السلة؟', [
      { text: 'تراجع', style: 'cancel' },
      {
        text: 'إفراغ',
        style: 'destructive',
        onPress: () => {
          haptic.warning();
          clearCart();
        },
      },
    ]);
  };

  const onClearMerchant = (merchantId: string, merchantName: string) => {
    confirm('حذف منتجات هذا المتجر', `سيتم حذف كل منتجات ${merchantName} من السلة.`, [
      { text: 'تراجع', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: () => {
          haptic.warning();
          clearMerchant(merchantId);
        },
      },
    ]);
  };

  const onCheckout = () => {
    haptic.success();
    navigation.navigate('CartCheckout');
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader
        title="سلتي"
        subtitle={
          groups.length > 1
            ? `منتجات من ${groups.length} تجار`
            : groups[0]
              ? `من ${groups[0].merchantNameAr}`
              : undefined
        }
        rightContent={
          <Pressable
            onPress={onClearAll}
            hitSlop={8}
            style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel="إفراغ السلة"
          >
            <Trash2 size={16} color={colors.danger} />
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.scrollPad} showsVerticalScrollIndicator={false}>
        {groups.map((group) => (
          <View key={group.merchantId} style={styles.section}>
            {/* Merchant header strip */}
            <View style={styles.merchantStrip}>
              <View style={styles.merchantIcon}>
                <Store size={16} color={colors.brand.red} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.merchantLabel}>المتجر</Text>
                <Text style={styles.merchantName} numberOfLines={1}>
                  {group.merchantNameAr}
                </Text>
                {openness?.[group.merchantId] ? (
                  openness[group.merchantId]!.isOpenNow ? (
                    <View style={[styles.openBadge, styles.openBadgeOpen]}>
                      <Text style={styles.openBadgeOpenText}>مفتوح الآن</Text>
                    </View>
                  ) : (
                    <View style={[styles.openBadge, styles.openBadgeClosed]}>
                      <Text style={styles.openBadgeClosedText} numberOfLines={1}>
                        {openness[group.merchantId]!.message ?? 'مغلق حالياً'}
                      </Text>
                    </View>
                  )
                ) : null}
              </View>
              <Pressable
                onPress={() => onClearMerchant(group.merchantId, group.merchantNameAr)}
                hitSlop={6}
                style={({ pressed }) => [styles.miniClearBtn, pressed && { opacity: 0.7 }]}
                accessibilityLabel={`حذف منتجات ${group.merchantNameAr}`}
              >
                <Trash2 size={14} color={colors.danger} />
              </Pressable>
            </View>

            {/* Items */}
            {group.items.map((item) => (
              <View key={item.productId} style={[styles.row, shadows.sm]}>
                <View style={styles.thumb}>
                  {item.imageUrl ? (
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={{ width: '100%', height: '100%' }}
                    />
                  ) : (
                    <Package size={20} color={colors.brand.red} />
                  )}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.itemName} numberOfLines={2}>
                    {item.nameAr}
                  </Text>
                  <View style={styles.itemMeta}>
                    <MoneyText amount={item.price} tone="brand" size="sm" />
                    <Text style={styles.itemMultiplier}>× {item.quantity}</Text>
                  </View>
                </View>

                {/* Stepper */}
                <View style={styles.stepper}>
                  <Pressable
                    onPress={() => {
                      haptic.tap();
                      if (item.quantity <= 1) {
                        removeFromCart(item.productId, item.merchantId);
                      } else {
                        setItemQuantity(item.productId, item.quantity - 1, item.merchantId);
                      }
                    }}
                    hitSlop={4}
                    style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.7 }]}
                    accessibilityLabel="نقصان"
                  >
                    {item.quantity <= 1 ? (
                      <Trash2 size={14} color={colors.danger} />
                    ) : (
                      <Minus size={14} color={colors.ink} />
                    )}
                  </Pressable>
                  <Text style={styles.stepValue}>{item.quantity}</Text>
                  <Pressable
                    onPress={() => {
                      haptic.tap();
                      setItemQuantity(item.productId, item.quantity + 1, item.merchantId);
                    }}
                    hitSlop={4}
                    style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.7 }]}
                    accessibilityLabel="زيادة"
                  >
                    <Plus size={14} color={colors.ink} />
                  </Pressable>
                </View>
              </View>
            ))}

            {/* Per-merchant subtotal */}
            <View style={styles.subRow}>
              <Text style={styles.subLabel}>إجمالي {group.merchantNameAr}</Text>
              <MoneyText amount={group.subtotal} tone="brand" size="md" />
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Sticky bottom: grand total + checkout */}
      <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
        <View style={styles.bottomInner}>
          {anyClosed && (
            <View style={styles.closedBanner}>
              <Text style={styles.closedBannerText} numberOfLines={2}>
                بعض المتاجر في سلتك مغلقة الآن. احذف منتجاتها لتقدر تكمل الطلب.
              </Text>
            </View>
          )}
          <View style={styles.subtotalRow}>
            <Text style={styles.subtotalLabel}>الإجمالي الكلي</Text>
            <MoneyText amount={cart.subtotal} tone="brand" size="xl" />
          </View>
          <PrimaryButton
            label={anyClosed ? 'لا يمكن إتمام الطلب — متجر مغلق' : 'إتمام الطلب'}
            onPress={onCheckout}
            disabled={anyClosed}
          />
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  emptyWrap: { flex: 1, justifyContent: 'center' },
  scrollPad: { padding: spacing.lg, paddingBottom: 220 },
  clearBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Per-merchant section
  section: { marginBottom: spacing.lg },
  merchantStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: spacing.sm,
  },
  // Open/closed badge under the merchant name
  openBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  openBadgeOpen: { backgroundColor: '#DCFCE7' },
  openBadgeOpenText: {
    color: '#166534',
    fontSize: 10,
    fontFamily: fontFamilies.bodyBold,
  },
  openBadgeClosed: { backgroundColor: colors.dangerLight },
  openBadgeClosedText: {
    color: colors.danger,
    fontSize: 10,
    fontFamily: fontFamilies.bodyBold,
  },
  // Warning banner above the checkout button
  closedBanner: {
    backgroundColor: colors.dangerLight,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  closedBannerText: {
    color: colors.danger,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 12,
    textAlign: 'center',
  },
  merchantIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
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
  miniClearBtn: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    backgroundColor: colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  itemName: {
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
    fontSize: fontSizes.sm,
  },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemMultiplier: {
    color: colors.text.muted,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
  },
  // Stepper
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    padding: 3,
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    minWidth: 24,
    textAlign: 'center',
    fontFamily: fontFamilies.headingBlack,
    fontSize: fontSizes.sm,
    color: colors.ink,
  },
  // Per-merchant subtotal row
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.brand.redLight,
    borderRadius: radii.md,
    marginTop: spacing.xs,
  },
  subLabel: {
    fontSize: fontSizes.sm,
    color: colors.ink,
    fontFamily: fontFamilies.bodyBold,
  },
  // Bottom bar
  bottomBar: {
    position: 'absolute',
    // left/right, not insetInline*: pinning BOTH logical sides did not
    // stretch the element on this RN version — it collapsed to its content
    // width and drifted to one edge. A full-bleed bar is symmetric, so the
    // physical props are also RTL-safe here.
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  bottomInner: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  subtotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subtotalLabel: {
    fontSize: fontSizes.md,
    color: colors.ink,
    fontFamily: fontFamilies.bodyBold,
  },
});
