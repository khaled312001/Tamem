import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useMemo } from 'react';
import { Clock, MapPin, Phone, Star, Store } from 'lucide-react-native';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HeartButton } from '../components/HeartButton';
import { EmptyState, ForwardChevron, MoneyText, PrimaryButton, StatusPill } from '../components/ui';
import { api } from '../lib/api';
import { LIST_PERF } from '../lib/listPerf';
import { formatEta } from '../lib/eta';
import type { HomeStackParamList } from '../navigation/HomeStack';
import { BackChevron } from '../theme/rtl';
import { colors, fontFamilies, fontSizes, radii, shadows, spacing } from '../theme/tokens';

interface MerchantDetail {
  id: string;
  storeNameAr: string;
  description?: string;
  logoUrl?: string;
  coverUrl?: string;
  addressLine: string;
  rating?: number | null;
  isOpen: boolean;
  phone?: string | null;
  lat?: number | null;
  lng?: number | null;
  deliveryRadiusKm?: number | null;
  openHours?: Array<{ day: number; open: string; close: string }> | null;
  category?: { nameAr: string };
  /// Menu-image mode: photos of the merchant's paper menu. When present the
  /// customer views these and orders via the free-text "اطلب الآن" flow.
  menuImages?: string[] | null;
  products?: Array<{ id: string; nameAr: string; price: number; imageUrl?: string }>;
  /// Total catalogue size, independent of how many rows were embedded above.
  /// Absent on backends that predate the paginated product endpoints.
  productsTotal?: number;
  /// Server-computed openness verdict. Includes the next opening so we can
  /// render "يفتح غداً 10ص" instead of just "مغلق".
  openness?: {
    isOpenNow: boolean;
    reason: 'MANUAL_CLOSED' | 'MANUAL_TEMP_CLOSED' | 'OUT_OF_HOURS' | null;
    nextOpenAt: string | null;
    message: string | null;
  };
}

type RouteParam = RouteProp<HomeStackParamList, 'MerchantDetail'>;
type NavProp = NativeStackNavigationProp<HomeStackParamList, 'MerchantDetail'>;

type MerchantProduct = NonNullable<MerchantDetail['products']>[number];

/** Rows per page for the catalogue list. */
const PRODUCTS_PAGE_SIZE = 30;

/**
 * One product row. Memoised because the list can be thousands of rows long —
 * without it, any re-render of the screen re-renders every mounted row.
 */
const ProductRow = memo(function ProductRow({
  product,
  onPress,
}: {
  product: MerchantProduct;
  onPress: (id: string) => void;
}) {
  return (
    <Pressable
      onPress={() => onPress(product.id)}
      style={({ pressed }) => [styles.productRow, shadows.sm, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.productImg}>
        {product.imageUrl ? (
          <Image source={{ uri: product.imageUrl }} style={{ width: '100%', height: '100%' }} />
        ) : (
          <Store size={20} color={colors.brand.red} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.productName}>{product.nameAr}</Text>
        <MoneyText amount={Number(product.price)} tone="brand" size="sm" />
      </View>
      <HeartButton collection="product" id={product.id} merchantName={product.nameAr} size="sm" />
      <ForwardChevron size={16} color={colors.text.muted} />
    </Pressable>
  );
});

const productKey = (p: MerchantProduct) => p.id;

export function MerchantDetailScreen() {
  const route = useRoute<RouteParam>();
  const navigation = useNavigation<NavProp>();
  const { merchantId } = route.params;

  // Opening a product works even when the merchant is closed so the customer
  // can still browse; the add-to-cart button is what's actually disabled.
  const openProduct = useCallback(
    (productId: string) => navigation.navigate('ProductDetail', { productId }),
    [navigation],
  );

  const renderProduct = useCallback(
    ({ item }: { item: MerchantProduct }) => <ProductRow product={item} onPress={openProduct} />,
    [openProduct],
  );

  // `productsPageSize` caps the products embedded in the merchant payload —
  // the catalogue itself is paged separately below. On a backend that predates
  // this parameter the field is ignored and the full list comes back, which is
  // exactly the old behaviour, so this is safe to ship ahead of the deploy.
  const { data, isLoading, error, refetch } = useQuery<MerchantDetail>({
    queryKey: ['merchant', merchantId],
    queryFn: () =>
      api.raw
        .get(`/merchants/${merchantId}`, { params: { productsPageSize: 1 } })
        .then((r) => r.data.data),
    staleTime: 60_000,
  });

  /**
   * Products, one page at a time.
   *
   * Tolerates both backends: the paginated one returns
   * `{ data, meta.pagination }`, the older one returns a bare array of every
   * product. When there's no pagination meta we treat the response as the only
   * page, so an un-deployed server degrades to today's behaviour instead of
   * looping forever.
   */
  // `productsTotal` only exists on a backend that supports the paged product
  // routes. Without it, the merchant payload above already carries the whole
  // catalogue, so running the paged query too would fetch the same megabytes a
  // second time.
  const backendPaginates = data?.productsTotal !== undefined;

  const productsQ = useInfiniteQuery({
    queryKey: ['merchant-products', merchantId],
    enabled: backendPaginates,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const r = await api.raw.get(`/merchants/${merchantId}/products`, {
        params: { page: pageParam, pageSize: PRODUCTS_PAGE_SIZE },
      });
      return {
        items: (r.data?.data ?? []) as MerchantProduct[],
        pagination: r.data?.meta?.pagination as { page: number; totalPages: number } | undefined,
      };
    },
    getNextPageParam: (last) => {
      if (!last.pagination) return undefined;
      const { page, totalPages } = last.pagination;
      return page < totalPages ? page + 1 : undefined;
    },
    staleTime: 60_000,
  });

  const products = useMemo(
    () =>
      backendPaginates
        ? (productsQ.data?.pages.flatMap((p) => p.items) ?? [])
        : (data?.products ?? []),
    [backendPaginates, productsQ.data, data?.products],
  );

  /**
   * How many products to advertise in the section header.
   *
   * `productsTotal` is the authoritative count, but a backend that predates it
   * won't send one — then fall back to what we've actually loaded, which on
   * that same old backend is the whole catalogue anyway.
   */
  const productCount = data?.productsTotal ?? products.length;

  const loadMore = useCallback(() => {
    if (productsQ.hasNextPage && !productsQ.isFetchingNextPage) void productsQ.fetchNextPage();
  }, [productsQ]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={colors.brand.red} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={styles.errorHeader}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.floatingBack, pressed && { opacity: 0.7 }]}
            hitSlop={8}
            accessibilityLabel="رجوع"
          >
            <BackChevron size={20} color={colors.ink} />
          </Pressable>
        </View>
        <EmptyState
          icon={<Store size={36} color={colors.brand.red} />}
          title="المتجر غير موجود"
          subtitle="حاول مرة أخرى أو ارجع للقائمة"
          actionLabel="إعادة المحاولة"
          onAction={() => refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={[]} style={styles.container}>
      {/*
        A FlatList, not a ScrollView: the merchant payload can carry thousands
        of products (the pharmacy has ~2,900), and `.map()` inside a ScrollView
        mounted every one of them — each with its own Image and HeartButton.
        Everything above the product list is the header, so the layout is
        unchanged.
      */}
      <FlatList
        {...LIST_PERF}
        data={products}
        keyExtractor={productKey}
        renderItem={renderProduct}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          productsQ.isFetchingNextPage ? (
            <ActivityIndicator color={colors.brand.red} style={{ marginVertical: spacing.lg }} />
          ) : null
        }
        ListEmptyComponent={
          productsQ.isLoading ? null : !data.menuImages || data.menuImages.length === 0 ? (
            <View style={styles.emptyProductsCard}>
              <Phone size={20} color={colors.brand.red} />
              <Text style={styles.emptyProductsTitle}>اطلب أي حاجة من المتجر</Text>
              <Text style={styles.emptyProductsSub}>
                مفيش قائمة محددة هنا — كل اللي تطلبه هنوصّله من المتجر مباشرة.
              </Text>
            </View>
          ) : null
        }
        ListHeaderComponent={
          <>
            {/* ─────── Cover with floating back ─────── */}
            <View style={styles.cover}>
              {data.coverUrl ? (
                <Image
                  source={{ uri: data.coverUrl }}
                  style={styles.coverImage}
                  resizeMode="cover"
                />
              ) : (
                <LinearGradient
                  colors={['#E0301E', '#EC7A2C']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.coverPlaceholder}
                >
                  <Store size={56} color={colors.white} />
                </LinearGradient>
              )}
              <LinearGradient
                colors={['rgba(36,19,16,0.6)', 'transparent']}
                style={styles.coverOverlay}
              />
              <SafeAreaView edges={['top']} style={styles.coverHeader}>
                <Pressable
                  onPress={() => navigation.goBack()}
                  style={({ pressed }) => [styles.floatingBack, pressed && { opacity: 0.7 }]}
                  hitSlop={8}
                  accessibilityLabel="رجوع"
                >
                  <BackChevron size={20} color={colors.ink} />
                </Pressable>
                <HeartButton merchantId={data.id} merchantName={data.storeNameAr} floating />
              </SafeAreaView>
            </View>

            {/* ─────── Info card ─────── */}
            <View style={[styles.card, shadows.md]}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{data.storeNameAr}</Text>
                <StatusPill
                  label={(data.openness?.isOpenNow ?? data.isOpen) ? 'مفتوح الآن' : 'مغلق الآن'}
                  color={
                    (data.openness?.isOpenNow ?? data.isOpen) ? colors.success : colors.text.muted
                  }
                  dot
                />
              </View>
              {/* Closed-state banner — surfaces "يفتح غداً 10ص" so the customer
              doesn't bounce off without knowing when to come back. */}
              {!(data.openness?.isOpenNow ?? data.isOpen) && (
                <View style={styles.closedBanner}>
                  <Clock size={14} color={colors.danger} />
                  <Text style={styles.closedBannerText}>
                    {data.openness?.message ?? 'هذا المتجر مغلق حالياً'}
                  </Text>
                </View>
              )}
              {data.category && <Text style={styles.subtitle}>{data.category.nameAr}</Text>}

              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Star size={14} color={colors.brand.gold} fill={colors.brand.gold} />
                  <Text style={styles.metaText}>{Number(data.rating ?? 0).toFixed(1)}</Text>
                </View>
                <View style={styles.metaDivider} />
                <View style={styles.metaItem}>
                  <Clock size={14} color={colors.text.muted} />
                  <Text style={styles.metaText}>
                    {/* ETA computed from the merchant's distance if known, never
                    the old hard-coded "20-40 دقيقة". */}
                    {formatEta(typeof data.lat === 'number' ? 4 : null)}
                  </Text>
                </View>
                <View style={styles.metaDivider} />
                <View style={[styles.metaItem, { flex: 1 }]}>
                  <MapPin size={14} color={colors.text.muted} />
                  <Text style={styles.metaText} numberOfLines={1}>
                    {data.addressLine}
                  </Text>
                </View>
              </View>

              {/* Tap-to-call merchant — silent before. */}
              {data.phone ? (
                <Pressable
                  onPress={() => void Linking.openURL(`tel:${data.phone}`)}
                  style={({ pressed }) => [styles.phoneRow, pressed && { opacity: 0.85 }]}
                >
                  <View style={styles.phoneIcon}>
                    <Phone size={14} color={colors.brand.red} />
                  </View>
                  <Text style={styles.phoneText}>اتصل بالمتجر</Text>
                  <Text style={styles.phoneNumber}>{data.phone}</Text>
                </Pressable>
              ) : null}

              {data.description && <Text style={styles.description}>{data.description}</Text>}
            </View>

            {/* ─────── Menu images (menu-image mode) ─────── */}
            {data.menuImages && data.menuImages.length > 0 && (
              <View style={styles.section}>
                <View style={styles.productsHeaderRow}>
                  <Text style={styles.sectionTitle}>المنيو</Text>
                  <Text style={styles.productsCount}>{data.menuImages.length} صورة</Text>
                </View>
                <Text style={styles.productsHint}>
                  اضغط "اطلب الآن" بالأسفل واكتب طلبك من المنيو — هنوصّله لك من المتجر.
                </Text>
                {data.menuImages.map((uri, i) => (
                  <Image
                    key={`${uri}-${i}`}
                    source={{ uri }}
                    style={styles.menuImage}
                    resizeMode="contain"
                  />
                ))}
              </View>
            )}

            {/* ─────── Products (rows are the list body below) ─────── */}
            {productCount > 0 && (
              <View style={styles.section}>
                <View style={styles.productsHeaderRow}>
                  <Text style={styles.sectionTitle}>المنتجات المتاحة</Text>
                  <Text style={styles.productsCount}>{productCount} منتج</Text>
                </View>
                <Text style={styles.productsHint}>
                  اضغط "اطلب الآن" بالأسفل، أو افتح الطلب السريع من الصفحة الرئيسية لإضافة المنتجات.
                </Text>
              </View>
            )}
          </>
        }
      />

      {/* ─────── Sticky Order CTA ─────── */}
      <SafeAreaView edges={['bottom']} style={styles.ctaBar}>
        <View style={styles.ctaInner}>
          <PrimaryButton
            label={
              (data.openness?.isOpenNow ?? data.isOpen)
                ? 'اطلب الآن'
                : (data.openness?.message ?? 'المتجر مغلق حالياً')
            }
            disabled={!(data.openness?.isOpenNow ?? data.isOpen)}
            onPress={() => {
              navigation.navigate('DynamicServiceFlow', {
                serviceKey: 'delivery-supermarket',
                merchantId: data.id,
              });
            }}
          />
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  errorHeader: {
    padding: spacing.lg,
  },
  cover: {
    height: 240,
    backgroundColor: colors.brand.red,
    position: 'relative',
  },
  coverImage: { width: '100%', height: '100%' },
  coverPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  coverOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  coverHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  floatingBack: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  card: {
    backgroundColor: colors.white,
    marginHorizontal: spacing.lg,
    marginTop: -40,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderColor: colors.line,
    borderWidth: 1,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  closedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.dangerLight,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    marginTop: spacing.sm,
  },
  closedBannerText: {
    flex: 1,
    color: colors.danger,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
  },
  title: {
    flex: 1,
    fontSize: fontSizes.xl,
    fontFamily: fontFamilies.headingBlack,
    color: colors.ink,
  },
  subtitle: {
    fontSize: fontSizes.sm,
    color: colors.text.muted,
    marginTop: 4,
    fontFamily: fontFamilies.body,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: {
    fontSize: fontSizes.xs,
    color: colors.text.secondary,
    fontFamily: fontFamilies.bodyBold,
  },
  metaDivider: { width: 1, height: 14, backgroundColor: colors.line },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand.redLight,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  phoneIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneText: {
    flex: 1,
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
  },
  phoneNumber: {
    color: colors.brand.red,
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.sm,
    letterSpacing: 0.5,
  },
  description: {
    fontSize: fontSizes.sm,
    color: colors.text.secondary,
    marginTop: spacing.md,
    lineHeight: 22,
    fontFamily: fontFamilies.body,
  },
  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.headingBlack,
    color: colors.ink,
  },
  productsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  productsCount: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.bodyBold,
  },
  productsHint: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  menuImage: {
    width: '100%',
    height: 460,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceAlt ?? '#f5f5f4',
    marginBottom: spacing.md,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  productImg: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  productName: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
  },
  productPrice: {
    fontSize: fontSizes.sm,
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
    marginTop: 2,
  },
  emptyProductsCard: {
    alignItems: 'center',
    backgroundColor: colors.white,
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 6,
  },
  emptyProductsTitle: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.headingBold,
    color: colors.ink,
    marginTop: 4,
  },
  emptyProductsSub: {
    fontSize: fontSizes.sm,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  ctaBar: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    ...shadows.md,
  },
  ctaInner: {
    padding: spacing.lg,
  },
});
