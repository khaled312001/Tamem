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

import { EmptyState, MoneyText } from '../components/ui';
import { api } from '../lib/api';
import { showToast } from '../lib/toast';
import type { HomeStackParamList } from '../navigation/HomeStack';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import { ImageViewer } from '../components/ImageViewer';
import { productPrice } from '../lib/productPrice';
import { addToCart } from '../stores/cart';
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
  /** Percentage knob — independent of salePrice. */
  discount?: number | string | null;
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

  // Shared with the home rails so the same product can never show two prices.
  // This screen previously handled only `salePrice`, so a percentage-discounted
  // product displayed — and charged — its full list price here.
  const {
    now: effectivePrice,
    was: listPrice,
    off: discountPct,
    hasDiscount: hasSale,
  } = productPrice(data);

  // Guard `data.merchant` itself (not just openness) — an orphaned merchantId
  // would otherwise throw here.
  const merchantOpen = data.merchant?.openness?.isOpenNow ?? true;
  const productInStock =
    data.isAvailable && !data.isHidden && (data.stock == null || data.stock > 0);
  const canAdd = productInStock && merchantOpen;

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
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.lg }}
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
                  // Explicit page size. Inside a horizontal FlatList there is no
                  // parent width for `100%` to resolve against, so the page
                  // collapsed to zero — the image never drew and the tap never
                  // landed. This is why the product page looked image-less even
                  // though the same URL rendered fine in the store list.
                  <Pressable
                    onPress={() => setViewerAt(index)}
                    style={{ width: SCREEN_W, height: IMAGE_HEIGHT }}
                    accessibilityLabel="تكبير الصورة"
                  >
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
                <MoneyText
                  amount={listPrice ?? 0}
                  tone="muted"
                  size="sm"
                  strikethrough
                  showCurrency
                />
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

          {/* Quantity — in the page body, not the bottom bar, so the bar has a
              single action. */}
          <View style={styles.qtyRow}>
            <Text style={styles.qtyLabel}>الكمية</Text>
            <View style={styles.qtyWrap}>
              <Pressable
                onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1 || !canAdd}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.qtyBtn,
                  (quantity <= 1 || !canAdd) && styles.qtyBtnDisabled,
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityLabel="نقصان"
              >
                <Minus
                  size={17}
                  color={quantity <= 1 || !canAdd ? colors.text.muted : colors.white}
                />
              </Pressable>

              <Text style={styles.qtyValue}>{quantity}</Text>

              <Pressable
                onPress={() => setQuantity((q) => Math.min(data.stock ?? 99, q + 1))}
                disabled={!canAdd || (data.stock != null && quantity >= data.stock)}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.qtyBtn,
                  (!canAdd || (data.stock != null && quantity >= data.stock)) &&
                    styles.qtyBtnDisabled,
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityLabel="زيادة"
              >
                <Plus
                  size={17}
                  color={
                    !canAdd || (data.stock != null && quantity >= data.stock)
                      ? colors.text.muted
                      : colors.white
                  }
                />
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ─────── Sticky bottom bar ─────── */}
      {/*
        One row, one primary action. The previous version stacked a green
        "عرض السلة" gradient bar ON TOP of a row holding the stepper and the
        add button — three competing calls to action in the same 120px.
        The stepper moved up into the page body (where the reference puts it),
        leaving the bar to do one job.
      */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomInner}>
          <Pressable
            onPress={onAddToCart}
            disabled={!canAdd}
            style={({ pressed }) => [styles.addWrap, pressed && { opacity: 0.92 }]}
            accessibilityRole="button"
            accessibilityLabel="أضف إلى السلة"
          >
            <LinearGradient
              colors={canAdd ? ['#E0301E', '#EC7A2C'] : ['#D9D2CE', '#D9D2CE']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.addBar}
            >
              {canAdd && <ShoppingCart size={20} color={colors.white} />}
              <Text style={styles.addLabel} numberOfLines={1}>
                {!productInStock ? 'غير متاح' : !merchantOpen ? 'المتجر مغلق' : 'أضف إلى السلة'}
              </Text>
              {canAdd && (
                <Text style={styles.addPrice}>
                  {(effectivePrice * quantity).toLocaleString('ar-EG')} ج.م
                </Text>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      </View>

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
    // left/right, not insetInline*: pinning BOTH logical sides did not
    // stretch the element on this RN version — it collapsed to its content
    // width and drifted to one edge. A full-bleed bar is symmetric, so the
    // physical props are also RTL-safe here.
    left: 0,
    right: 0,
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
    // Arabic ascenders and the hamza sit high; at 28pt a 32 lineHeight (1.14x)
    // clipped the tops of letters. 1.5x is the minimum that clears them.
    lineHeight: Math.round(fontSizes.xxl * 1.5),
    textAlign: 'auto',
    // Android reserves extra glyph padding that fights an explicit lineHeight
    // and shifts the text up inside its box.
    includeFontPadding: false,
    paddingTop: 2,
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
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  qtyLabel: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyBold,
    color: colors.ink,
  },
  addWrap: { flex: 1 },
  addBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 56,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
  },
  addLabel: {
    flex: 1,
    color: colors.white,
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyExtraBold,
    textAlign: 'center',
    // Same Arabic clipping rule as the title: an implicit lineHeight crops
    // ascenders inside a fixed-height button.
    lineHeight: Math.round(fontSizes.md * 1.6),
    includeFontPadding: false,
  },
  addPrice: {
    color: colors.white,
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyExtraBold,
    lineHeight: Math.round(fontSizes.md * 1.6),
    includeFontPadding: false,
  },
  // Bottom bar
  // Laid out in flow after the ScrollView (which takes flex:1) rather than
  // absolutely positioned. Absolute meant guessing the tab bar's height, and
  // being a few pixels off left a white gap under the button that read as it
  // floating. In flow it always sits flush above the tab bar.
  bottomBar: {
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
    // Solid brand fill: as pale outlined squares these read as decoration
    // rather than controls.
    backgroundColor: colors.brand.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnDisabled: { backgroundColor: colors.line },
  // "View cart" shortcut bar — sits above the qty+add row
  qtyValue: {
    width: 32,
    textAlign: 'center',
    fontFamily: fontFamilies.headingBlack,
    fontSize: fontSizes.lg,
    color: colors.ink,
  },
});
