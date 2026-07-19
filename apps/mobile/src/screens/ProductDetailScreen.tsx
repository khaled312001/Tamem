/**
 * Product detail page — opened when the customer taps a product card on
 * the merchant screen. Shows a big image, price (with sale strike-through
 * when applicable), description, the merchant the product belongs to, and
 * an add-to-cart button with quantity controls.
 *
 * Multi-merchant carts are allowed — the checkout splits the order per
 * merchant. The "+ Add to cart" button is disabled when the product is
 * hidden, unavailable, or the merchant is closed.
 */
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Clock, Minus, Package, Plus, ShoppingCart, Star, Store } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image as ImageIcon } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, MoneyText, PrimaryButton } from '../components/ui';
import { api } from '../lib/api';
import { navigationRef } from '../lib/push';
import { showToast } from '../lib/toast';
import type { HomeStackParamList } from '../navigation/HomeStack';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import { ImageViewer } from '../components/ImageViewer';
import { addToCart, useCart } from '../stores/cart';
import { BackChevron } from '../theme/rtl';
import { colors, fontFamilies, fontSizes, radii, shadows, spacing } from '../theme/tokens';

/** Hero pager pages by full screen width. */
const SCREEN_W = Dimensions.get('window').width;

interface ProductDetail {
  id: string;
  name: string;
  nameAr: string;
  description?: string | null;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  price: number | string;
  salePrice?: number | string | null;
  stock?: number | null;
  isAvailable: boolean;
  isHidden: boolean;
  categoryName?: string | null;
  unit?: string | null;
  merchant: {
    id: string;
    storeNameAr: string;
    logoUrl?: string | null;
    rating?: number | string | null;
    openness?: {
      isOpenNow: boolean;
      message: string | null;
    };
  };
}

type RouteParam = RouteProp<HomeStackParamList, 'ProductDetail'>;
type NavProp = NativeStackNavigationProp<HomeStackParamList, 'ProductDetail'>;

export function ProductDetailScreen() {
  const route = useRoute<RouteParam>();
  const navigation = useNavigation<NavProp>();
  const { productId } = route.params;
  const [quantity, setQuantity] = useState(1);
  const [viewerAt, setViewerAt] = useState<number | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  // Reactive cart state. MUST be called unconditionally, above the early
  // returns below — placing it after them meant it ran only once `data` loaded,
  // adding hooks that didn't exist on the loading render → React threw
  // "Rendered more hooks than during the previous render" and crashed the screen
  // on EVERY product open. (This is the bug: "opening any product closes the app".)
  const cart = useCart();

  const { data, isLoading, error, refetch } = useQuery<ProductDetail>({
    queryKey: ['product', productId],
    queryFn: () => api.raw.get(`/products/${productId}`).then((r) => r.data.data),
    // Always-fresh on focus so price/availability stay current after admin
    // edits without forcing a full app reload.
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // ── Loading ───────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={styles.headerSpacer} />
        <View style={styles.skelImage} />
        <View style={styles.skelBody}>
          <View style={styles.skelLine} />
          <View style={[styles.skelLine, { width: '60%' }]} />
          <View style={[styles.skelLine, { width: '40%', marginTop: spacing.md }]} />
        </View>
        <ActivityIndicator color={colors.brand.red} style={{ marginTop: spacing.lg }} />
      </SafeAreaView>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.errorBack}
          hitSlop={10}
          accessibilityLabel="رجوع"
        >
          <BackChevron size={20} color={colors.ink} />
        </Pressable>
        <EmptyState
          icon={<Package size={36} color={colors.brand.red} />}
          title="تعذر تحميل تفاصيل المنتج"
          subtitle="حاول مرة أخرى"
          actionLabel="إعادة المحاولة"
          onAction={() => refetch()}
        />
      </SafeAreaView>
    );
  }

  const priceNum = Number(data.price ?? 0);
  const saleNum = data.salePrice != null ? Number(data.salePrice) : null;
  const hasSale = saleNum != null && saleNum > 0 && saleNum < priceNum;
  const discountPct = hasSale ? Math.round(((priceNum - saleNum!) / priceNum) * 100) : 0;
  const effectivePrice = hasSale ? saleNum! : priceNum;

  // Guard `data.merchant` itself (not just openness) — an orphaned merchantId
  // would otherwise throw here.
  const merchantOpen = data.merchant?.openness?.isOpenNow ?? true;
  const productInStock =
    data.isAvailable && !data.isHidden && (data.stock == null || data.stock > 0);
  const canAdd = productInStock && merchantOpen;

  const openCart = () => {
    if (!navigationRef.isReady()) return;
    navigationRef.navigate('App', { screen: 'HomeTab', params: { screen: 'Cart' } });
  };

  const onAddToCart = () => {
    if (!canAdd) return;
    addToCart({
      product: {
        id: data.id,
        nameAr: data.nameAr,
        price: effectivePrice,
        imageUrl: data.imageUrl,
      },
      merchantId: data.merchant.id,
      merchantNameAr: data.merchant.storeNameAr,
      quantity,
    });
    showToast({ title: 'تمت إضافة المنتج إلى السلة', tone: 'success' });
  };

  const rating = data.merchant?.rating != null ? Number(data.merchant.rating) : null;

  /**
   * Every image for this product, primary first.
   *
   * `imageUrls` is populated by the external-API sync and was declared on the
   * type but never rendered — extra photos were fetched and thrown away.
   * De-duplicated because a synced feed often repeats the primary image inside
   * the extras array.
   */
  const gallery = Array.from(
    new Set([data.imageUrl, ...(data.imageUrls ?? [])].filter(Boolean) as string[]),
  );

  return (
    <SafeAreaView edges={[]} style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        {/* ─────── Big image + back button ─────── */}
        <View style={styles.imageWrap}>
          {gallery.length > 0 ? (
            <>
              <FlatList
                data={gallery}
                keyExtractor={(uri: string, i: number) => `${uri}-${i}`}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) =>
                  setHeroIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))
                }
                renderItem={({ item, index }: { item: string; index: number }) => (
                  <Pressable onPress={() => setViewerAt(index)} accessibilityLabel="تكبير الصورة">
                    <Image source={{ uri: item }} style={styles.image} resizeMode="cover" />
                  </Pressable>
                )}
              />
              {gallery.length > 1 && (
                <View style={styles.galleryCounter}>
                  <ImageIcon size={13} color={colors.white} />
                  <Text style={styles.galleryCounterText}>
                    {heroIndex + 1}/{gallery.length}
                  </Text>
                </View>
              )}
            </>
          ) : (
            <LinearGradient
              colors={['#FDE5DC', '#FFE9D7']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.imagePlaceholder}
            >
              <Package size={64} color={colors.brand.red} />
            </LinearGradient>
          )}
          <SafeAreaView edges={['top']} style={styles.floatingHeader}>
            <Pressable
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [styles.floatingBack, pressed && { opacity: 0.7 }]}
              hitSlop={8}
              accessibilityLabel="رجوع"
            >
              <BackChevron size={20} color={colors.ink} />
            </Pressable>
            {hasSale && (
              <View style={styles.discountBadge}>
                <Text style={styles.discountText}>خصم {discountPct}%</Text>
              </View>
            )}
          </SafeAreaView>
        </View>

        {/* ─────── Info card ─────── */}
        <View style={[styles.infoCard, shadows.sm]}>
          {data.categoryName && <Text style={styles.categoryTag}>{data.categoryName}</Text>}
          <Text style={styles.title}>{data.nameAr}</Text>
          {/* English/secondary name when it differs — pharmacy items carry it. */}
          {data.name && data.name.trim() && data.name.trim() !== (data.nameAr ?? '').trim() ? (
            <Text style={styles.subtitleEn}>{data.name}</Text>
          ) : null}

          {/* Merchant strip */}
          <Pressable
            onPress={() => navigation.navigate('MerchantDetail', { merchantId: data.merchant.id })}
            style={({ pressed }) => [styles.merchantRow, pressed && { opacity: 0.85 }]}
          >
            <View style={styles.merchantLogo}>
              {data.merchant.logoUrl ? (
                <Image source={{ uri: data.merchant.logoUrl }} style={styles.merchantLogo} />
              ) : (
                <Store size={16} color={colors.brand.red} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.merchantLabel}>من متجر</Text>
              <Text style={styles.merchantName} numberOfLines={1}>
                {data.merchant.storeNameAr}
              </Text>
            </View>
            {rating != null && rating > 0 && (
              <View style={styles.ratingPill}>
                <Star size={12} color={colors.brand.gold} fill={colors.brand.gold} />
                <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
              </View>
            )}
          </Pressable>

          {/* Price block */}
          <View style={styles.priceRow}>
            <MoneyText amount={effectivePrice} tone="brand" size="xl" />
            {hasSale && (
              <View style={{ marginStart: spacing.sm }}>
                <MoneyText amount={priceNum} tone="muted" size="sm" strikethrough showCurrency />
              </View>
            )}
            {data.unit ? <Text style={styles.unitText}>/ {data.unit}</Text> : null}
          </View>

          {/* Availability banner */}
          {!productInStock ? (
            <View style={[styles.banner, styles.bannerDanger]}>
              <Package size={14} color={colors.danger} />
              <Text style={styles.bannerDangerText}>هذا المنتج غير متاح حالياً</Text>
            </View>
          ) : !merchantOpen ? (
            <View style={[styles.banner, styles.bannerWarn]}>
              <Clock size={14} color="#92400E" />
              <Text style={styles.bannerWarnText}>
                {data.merchant.openness?.message ?? 'المتجر مغلق حالياً'}
              </Text>
            </View>
          ) : data.stock != null && data.stock <= 5 ? (
            <View style={[styles.banner, styles.bannerWarn]}>
              <Package size={14} color="#92400E" />
              <Text style={styles.bannerWarnText}>باقي {data.stock} فقط في المخزون</Text>
            </View>
          ) : null}

          {/* Description */}
          {data.description ? (
            <View style={styles.descBlock}>
              <Text style={styles.sectionTitle}>الوصف</Text>
              <Text style={styles.description}>{data.description}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* ─────── Sticky bottom bar: quantity + Add to cart ─────── */}
      <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
        {/* "View cart" shortcut — appears the moment the user has anything
            in the cart, so they don't need to leave the product page to
            find the checkout. */}
        {cart.count > 0 && (
          <Pressable
            onPress={openCart}
            style={({ pressed }) => [styles.viewCart, pressed && { opacity: 0.92 }]}
            accessibilityRole="button"
            accessibilityLabel={`فتح السلة، ${cart.count} منتج`}
          >
            <LinearGradient
              colors={['#1FA463', '#0F6B3C']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.viewCartBar}
            >
              <View style={styles.viewCartIcon}>
                <ShoppingCart size={16} color={colors.white} />
                <View style={styles.viewCartBadge}>
                  <Text style={styles.viewCartBadgeText}>
                    {cart.count > 99 ? '99+' : cart.count}
                  </Text>
                </View>
              </View>
              <Text style={styles.viewCartLabel}>عرض السلة وإتمام الطلب</Text>
              <MoneyText amount={cart.subtotal} tone="inverse" size="sm" showCurrency />
            </LinearGradient>
          </Pressable>
        )}
        <View style={styles.bottomInner}>
          {/* Quantity stepper */}
          <View style={styles.qtyWrap}>
            <Pressable
              onPress={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1 || !canAdd}
              style={({ pressed }) => [
                styles.qtyBtn,
                (quantity <= 1 || !canAdd) && styles.qtyBtnDisabled,
                pressed && { opacity: 0.7 },
              ]}
              accessibilityLabel="نقصان"
            >
              <Minus size={16} color={quantity <= 1 || !canAdd ? colors.text.muted : colors.ink} />
            </Pressable>
            <Text style={styles.qtyValue}>{quantity}</Text>
            <Pressable
              onPress={() => setQuantity((q) => Math.min(data.stock ?? 99, q + 1))}
              disabled={!canAdd || (data.stock != null && quantity >= data.stock)}
              style={({ pressed }) => [
                styles.qtyBtn,
                (!canAdd || (data.stock != null && quantity >= data.stock)) &&
                  styles.qtyBtnDisabled,
                pressed && { opacity: 0.7 },
              ]}
              accessibilityLabel="زيادة"
            >
              <Plus size={16} color={!canAdd ? colors.text.muted : colors.ink} />
            </Pressable>
          </View>

          {/* CTA — flex:1 so it stretches to fill the row */}
          <View style={{ flex: 1 }}>
            <PrimaryButton
              label={
                !productInStock
                  ? 'غير متاح'
                  : !merchantOpen
                    ? 'المتجر مغلق'
                    : `إضافة (${(effectivePrice * quantity).toLocaleString('ar-EG')} ج.م)`
              }
              Icon={ShoppingCart}
              disabled={!canAdd}
              onPress={onAddToCart}
            />
          </View>
        </View>
      </SafeAreaView>

      {/* Shared with the store menu: pages through every product photo. */}
      <ImageViewer images={gallery} startIndex={viewerAt} onClose={() => setViewerAt(null)} />
    </SafeAreaView>
  );
}

const IMAGE_HEIGHT = 320;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  headerSpacer: { height: 80, backgroundColor: colors.soft },
  subtitleEn: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.text.muted,
    textAlign: 'right',
    marginTop: 2,
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: { width: '100%', height: '80%' },
  viewerClose: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Loading skeletons
  skelImage: { height: IMAGE_HEIGHT, backgroundColor: colors.soft },
  skelBody: { padding: spacing.lg, gap: spacing.sm },
  skelLine: { height: 14, backgroundColor: colors.line, borderRadius: 4 },
  // Error back button
  errorBack: {
    width: 40,
    height: 40,
    margin: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  // Image header
  imageWrap: {
    width: '100%',
    height: IMAGE_HEIGHT,
    backgroundColor: colors.soft,
    position: 'relative',
  },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingHeader: {
    position: 'absolute',
    top: 0,
    insetInlineStart: 0,
    insetInlineEnd: 0,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  floatingBack: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  galleryCounter: {
    position: 'absolute',
    bottom: 14,
    insetInlineStart: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  galleryCounterText: {
    color: colors.white,
    fontSize: 12,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  discountBadge: {
    backgroundColor: colors.brand.red,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  discountText: {
    color: colors.white,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
  },
  // Info card sits on top of the image, slightly overlapping
  infoCard: {
    backgroundColor: colors.white,
    margin: spacing.lg,
    marginTop: -spacing.xl,
    padding: spacing.lg,
    borderRadius: radii.xl,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  categoryTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brand.redLight,
    color: colors.brand.red,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  title: {
    fontSize: fontSizes.xxl,
    fontFamily: fontFamilies.headingBlack,
    color: colors.ink,
    lineHeight: 32,
  },
  // Merchant strip
  merchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: radii.lg,
  },
  merchantLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  merchantLabel: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
  },
  merchantName: {
    fontSize: fontSizes.sm,
    color: colors.ink,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  ratingText: {
    fontSize: fontSizes.xs,
    color: colors.ink,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  // Price
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  unitText: {
    marginStart: spacing.xs,
    fontSize: fontSizes.sm,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
  },
  // Banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  bannerDanger: { backgroundColor: colors.dangerLight },
  bannerDangerText: {
    flex: 1,
    color: colors.danger,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
  },
  bannerWarn: { backgroundColor: 'rgba(242,169,59,0.15)' },
  bannerWarnText: {
    flex: 1,
    color: '#92400E',
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
  },
  // Description
  descBlock: { gap: 4 },
  sectionTitle: {
    fontSize: fontSizes.sm,
    color: colors.text.muted,
    fontFamily: fontFamilies.bodyExtraBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  description: {
    fontSize: fontSizes.md,
    color: colors.ink,
    fontFamily: fontFamilies.body,
    lineHeight: 22,
  },
  // Bottom bar
  bottomBar: {
    position: 'absolute',
    insetInlineStart: 0,
    insetInlineEnd: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  bottomInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  qtyWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: 6,
  },
  qtyBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnDisabled: { backgroundColor: colors.line },
  // "View cart" shortcut bar — sits above the qty+add row
  viewCart: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  viewCartBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
  },
  viewCartIcon: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  viewCartBadge: {
    position: 'absolute',
    top: -5,
    insetInlineEnd: -5,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.brand.gold,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#0F6B3C',
  },
  viewCartBadgeText: {
    color: colors.brand.dark,
    fontFamily: fontFamilies.headingBlack,
    fontSize: 10,
    lineHeight: 12,
    includeFontPadding: false,
  },
  viewCartLabel: {
    flex: 1,
    color: colors.white,
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.sm,
  },
  qtyValue: {
    width: 32,
    textAlign: 'center',
    fontFamily: fontFamilies.headingBlack,
    fontSize: fontSizes.lg,
    color: colors.ink,
  },
});
