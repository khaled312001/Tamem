import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useMemo, useState } from 'react';
import { Phone, Search, Store, X } from 'lucide-react-native';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HeartButton } from '../components/HeartButton';
import { EmptyState, PrimaryButton } from '../components/ui';
import { api } from '../lib/api';
import { LIST_PERF } from '../lib/listPerf';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { addToCart, setItemQuantity, useCart } from '../stores/cart';
import { CartBar } from './merchant-detail/CartBar';
import { MenuImagesSection } from './merchant-detail/MenuImagesSection';
import { MerchantHeaderCard } from './merchant-detail/MerchantHeaderCard';
import { MerchantProductRow } from './merchant-detail/MerchantProductRow';
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

const productKey = (p: MerchantProduct) => p.id;

export function MerchantDetailScreen() {
  const route = useRoute<RouteParam>();
  const navigation = useNavigation<NavProp>();
  const { merchantId } = route.params;
  const [productSearch, setProductSearch] = useState('');
  const debouncedProductSearch = useDebouncedValue(productSearch, 300);
  const cart = useCart();

  // Opening a product works even when the merchant is closed so the customer
  // can still browse; the add-to-cart button is what's actually disabled.
  const openProduct = useCallback(
    (productId: string) => navigation.navigate('ProductDetail', { productId }),
    [navigation],
  );

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
    queryKey: ['merchant-products', merchantId, debouncedProductSearch],
    enabled: backendPaginates,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const r = await api.raw.get(`/merchants/${merchantId}/products`, {
        params: {
          page: pageParam,
          pageSize: PRODUCTS_PAGE_SIZE,
          ...(debouncedProductSearch ? { q: debouncedProductSearch } : {}),
        },
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

  // Derived from `data`, so these must come after the query above.
  const isClosed = !(data?.openness?.isOpenNow ?? data?.isOpen ?? true);
  const merchantName = data?.storeNameAr ?? '';

  /** productId -> quantity, for this store only. */
  const qtyById = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of cart.items) {
      if (it.merchantId === merchantId) m.set(it.productId, it.quantity);
    }
    return m;
  }, [cart.items, merchantId]);

  const renderProduct = useCallback(
    ({ item }: { item: MerchantProduct }) => (
      <MerchantProductRow
        product={item}
        quantity={qtyById.get(item.id) ?? 0}
        disabled={isClosed}
        onPress={() => openProduct(item.id)}
        onAdd={() =>
          addToCart({
            product: {
              id: item.id,
              nameAr: item.nameAr,
              price: Number(item.price),
              imageUrl: item.imageUrl ?? null,
            },
            merchantId,
            merchantNameAr: merchantName,
          })
        }
        onRemove={() => setItemQuantity(item.id, (qtyById.get(item.id) ?? 1) - 1, merchantId)}
      />
    ),
    [openProduct, qtyById, isClosed, merchantId, merchantName],
  );

  // `productsPageSize` caps the products embedded in the merchant payload —
  // the catalogue itself is paged separately below. On a backend that predates
  // this parameter the field is ignored and the full list comes back, which is
  // exactly the old behaviour, so this is safe to ship ahead of the deploy.

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

            <MerchantHeaderCard
              data={{
                storeNameAr: data.storeNameAr,
                logoUrl: data.logoUrl,
                addressLine: data.addressLine,
                phone: data.phone,
                rating: data.rating,
                categoryName: data.category?.nameAr ?? null,
                productCount,
                isOpenNow: data.openness?.isOpenNow ?? data.isOpen,
                opennessMessage: data.openness?.message,
              }}
              onPressMap={
                typeof data.lat === 'number' && typeof data.lng === 'number'
                  ? () =>
                      void Linking.openURL(
                        `https://www.google.com/maps/search/?api=1&query=${data.lat},${data.lng}`,
                      )
                  : undefined
              }
            />

            {!!data.description && <Text style={styles.description}>{data.description}</Text>}

            {!!data.menuImages && data.menuImages.length > 0 && (
              <View style={styles.section}>
                <MenuImagesSection images={data.menuImages} />
              </View>
            )}

            {/* ─────── Products (rows are the list body below) ─────── */}
            {productCount > 0 && (
              <View style={styles.section}>
                <View style={styles.productsHeaderRow}>
                  <Text style={styles.sectionTitle}>المنتجات</Text>
                  {/* A count chip rather than loose grey text — it reads as a
                      value, and it reflects the SEARCH result once filtering,
                      so the number never contradicts the list under it. */}
                  <View style={styles.countChip}>
                    <Text style={styles.countChipText}>
                      {debouncedProductSearch ? `${products.length} نتيجة` : `${productCount} صنف`}
                    </Text>
                  </View>
                </View>

                {/* Server-side search across the WHOLE catalogue, not just the
                    pages loaded so far — /merchants/{id}/products accepts `q`. */}
                <View style={styles.searchBox}>
                  <Search size={18} color={colors.text.muted} />
                  <TextInput
                    value={productSearch}
                    onChangeText={setProductSearch}
                    placeholder="ابحث داخل منتجات المتجر…"
                    placeholderTextColor={colors.text.muted}
                    style={styles.searchInput}
                    returnKeyType="search"
                  />
                  {!!productSearch && (
                    <Pressable
                      onPress={() => setProductSearch('')}
                      hitSlop={10}
                      accessibilityLabel="مسح البحث"
                      style={styles.clearBtn}
                    >
                      <X size={13} color={colors.white} />
                    </Pressable>
                  )}
                </View>

                {/* Searching a 2,500-item catalogue can take a moment; without
                    this the previous results just sit there looking stale. */}
                {productsQ.isFetching && !productsQ.isFetchingNextPage && (
                  <View style={styles.searchingRow}>
                    <ActivityIndicator size="small" color={colors.brand.red} />
                    <Text style={styles.searchingText}>جاري البحث…</Text>
                  </View>
                )}

                {!!debouncedProductSearch && !productsQ.isFetching && products.length === 0 && (
                  <Text style={styles.noResults}>
                    لا توجد منتجات تطابق «{debouncedProductSearch}»
                  </Text>
                )}
              </View>
            )}
          </>
        }
      />

      {/* ─────── Sticky bottom bar ─────── */}
      {/* Once anything is in the cart, checking out beats starting a free-text
          order — so the cart bar replaces the CTA rather than stacking on it. */}
      {cart.count > 0 ? (
        <CartBar
          count={cart.count}
          subtotal={cart.subtotal}
          onPress={() => navigation.navigate('Cart')}
        />
      ) : (
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
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  countChip: {
    backgroundColor: '#FFF1F0',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countChipText: {
    fontSize: 12,
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  clearBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.text.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  searchingText: { fontSize: 12, color: colors.brand.gray, fontFamily: fontFamilies.body },
  noResults: {
    marginTop: spacing.md,
    fontSize: 13,
    color: colors.brand.gray,
    fontFamily: fontFamilies.body,
    textAlign: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#EFE7E2',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginTop: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSizes.sm,
    color: colors.text.primary,
    textAlign: 'auto',
    padding: 0,
  },
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
    textAlign: 'auto',
  },
  productsHeaderRow: {
    flexDirection: 'row',
    // 'center' not 'baseline': the count is a chip now, and baseline alignment
    // pushed it visually below the title.
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
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
