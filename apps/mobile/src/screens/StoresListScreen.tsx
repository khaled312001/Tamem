import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownUp,
  Package,
  Search,
  SlidersHorizontal,
  Star,
  Store,
  WifiOff,
  X,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Image } from '../components/ui/CachedImage';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FilterDrawer, type FilterGroup } from '../components/FilterDrawer';
import { GradientHeader } from '../components/GradientHeader';
import { HeartButton } from '../components/HeartButton';
import { CardListSkeleton, EmptyState } from '../components/ui';
import { api } from '../lib/api';
import { LIST_PERF } from '../lib/listPerf';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { productPrice } from '../lib/productPrice';
import type { HomeStackParamList } from '../navigation/HomeStack';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'StoresList'>;
type SortKey = 'recommended' | 'rating' | 'open';
const SORT_LABELS: Record<SortKey, string> = {
  recommended: 'الموصى بها',
  rating: 'الأعلى تقييماً',
  open: 'المفتوحة أولاً',
};

interface Merchant {
  id: string;
  storeNameAr: string;
  addressLine: string;
  rating?: number | null;
  isOpen: boolean;
  logoUrl?: string | null;
  category?: { id: string; nameAr: string };
  /** Where the STORE is. Ordering from another city is a different proposition
   *  — different wait, different fee — so it is worth filtering on. */
  city?: string | null;
}

interface Category {
  id: string;
  nameAr: string;
  sortOrder: number;
}

interface Section {
  name: string;
  count: number;
  merchants: number;
}

interface ProductHit {
  id: string;
  nameAr?: string | null;
  name?: string | null;
  price?: number | string | null;
  salePrice?: number | string | null;
  discount?: number | string | null;
  saleEndsAt?: string | null;
  imageUrl?: string | null;
  categoryName?: string | null;
  merchant?: {
    id: string;
    storeNameAr?: string | null;
    logoUrl?: string | null;
    isOpen?: boolean;
  } | null;
}

export function StoresListScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<HomeStackParamList, 'StoresList'>>();

  // Honour the category the caller navigated with. The home screen has always
  // passed `categoryId`, but this screen ignored it and filtered by its own
  // hardcoded chip list instead — so tapping a category opened an unfiltered
  // list. Also seeds the search box from `params.search` for the same reason.
  const [activeCategory, setActiveCategory] = useState<string | null>(
    route.params?.categoryId ?? null,
  );
  const [search, setSearch] = useState(route.params?.search ?? '');
  const [sortKey, setSortKey] = useState<SortKey>('recommended');
  // Pre-select the city passed from the Delivery entry screen (قفط/قنا), so
  // opening a category already filtered to a city just works.
  const [activeCity, setActiveCity] = useState<string | null>(route.params?.city ?? null);
  // Shared product section (e.g. مشويات) filtered ACROSS merchants. When set,
  // the list switches from "stores" to matching products from every merchant.
  // Preset from the home "أقسام المنتجات" grid — opens straight into the
  // cross-merchant product list for that section (e.g. بيتزا).
  const [activeSection, setActiveSection] = useState<string | null>(route.params?.section ?? null);

  // Chips come from the Categories table now, not a hardcoded list of four
  // slugs that silently stopped matching whatever the admin actually created.
  // Same query key the home screen uses, so this costs no extra request.
  const { data: categories } = useQuery<Category[]>({
    queryKey: ['home-categories'],
    queryFn: () => api.raw.get('/categories').then((r) => r.data.data),
    staleTime: 5 * 60_000,
  });

  // The input stays instant; only the query waits. Previously `search` went
  // straight into the key, so one word = one request per letter.
  const debouncedSearch = useDebouncedValue(search, 300);

  const {
    data: merchants,
    isLoading,
    isFetching,
    isError: merchantsError,
    refetch: refetchMerchants,
  } = useQuery<Merchant[]>({
    queryKey: ['merchants', activeCategory, debouncedSearch],
    queryFn: () => {
      // Load the whole list, not just the default first page — otherwise the
      // screen shows a slice of the stores AND the city filter can't see every
      // city (so قفط/قنا never both appear). 200 covers the catalogue with room
      // to grow; revisit with infinite-scroll if it ever passes a few hundred.
      const params: Record<string, string> = { pageSize: '200' };
      if (activeCategory) params.categoryId = activeCategory;
      if (debouncedSearch) params.search = debouncedSearch;
      return api.raw.get('/merchants', { params }).then((r) => r.data.data);
    },
    // Browsing back and forth shouldn't refetch the same store list.
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  // The unified section list (مشويات، بيتزا…) shared across all merchants of the
  // active type. Sourced from the same column the store page filters with.
  const { data: sections } = useQuery<Section[]>({
    queryKey: ['product-sections', activeCategory],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (activeCategory) params.merchantCategoryId = activeCategory;
      return api.raw.get('/product-sections', { params }).then((r) => r.data.data);
    },
    staleTime: 5 * 60_000,
  });

  // Cross-merchant products for the selected section.
  const { data: sectionProducts, isLoading: loadingProducts } = useQuery<ProductHit[]>({
    queryKey: ['section-products', activeSection, activeCategory],
    enabled: !!activeSection,
    queryFn: () => {
      const params: Record<string, string> = { section: activeSection!, pageSize: '50' };
      if (activeCategory) params.merchantCategoryId = activeCategory;
      return api.raw.get('/products', { params }).then((r) => r.data.data);
    },
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  // Product search — because the search box searches store NAMES, typing a
  // product or section ("بيتزا") matched no store and dead-ended on "لا توجد
  // محلات". When the query finds no store, we fall back to matching PRODUCTS
  // across every merchant, so the search finds what the customer actually means.
  const isSearching = !activeSection && debouncedSearch.trim().length >= 2;
  const { data: searchProducts, isLoading: loadingSearchProducts } = useQuery<ProductHit[]>({
    queryKey: ['search-products-list', debouncedSearch, activeCategory],
    enabled: isSearching,
    queryFn: () => {
      const params: Record<string, string> = { search: debouncedSearch.trim(), pageSize: '30' };
      if (activeCategory) params.merchantCategoryId = activeCategory;
      return api.raw.get('/products', { params }).then((r) => r.data.data);
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const activeCategoryName = categories?.find((c) => c.id === activeCategory)?.nameAr ?? null;

  // Cities present in the CURRENT result set — derived from what was already
  // fetched, so the row costs nothing and can never offer a city that comes
  // back empty. Hidden when everything is in one city: a filter with a single
  // option is clutter.
  const cityOptions = useMemo(
    () =>
      Array.from(new Set((merchants ?? []).map((m) => (m.city ?? '').trim()).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b, 'ar'),
      ),
    [merchants],
  );

  const sorted = useMemo(() => {
    const base = activeCity
      ? (merchants ?? []).filter((m) => (m.city ?? '').trim() === activeCity)
      : (merchants ?? []);
    const list = base.slice();
    if (sortKey === 'rating') {
      list.sort((a, b) => Number(b.rating ?? 0) - Number(a.rating ?? 0));
    } else if (sortKey === 'open') {
      list.sort((a, b) => Number(b.isOpen) - Number(a.isOpen));
    }
    return list;
  }, [merchants, sortKey, activeCity]);

  /*
   * Sorting used to be one button that cycled recommended → rating → open.
   * Nothing on screen said those three existed, so the only way to find out
   * was to keep tapping and read the label each time — and to get back to the
   * one you wanted you had to go all the way round. The choices are listed now.
   */
  const sortLabel = SORT_LABELS[sortKey];

  /*
   * Filters. They were three rows of sideways-scrolling chips (type, city,
   * section) plus a sort button: the rows ran off the screen and nothing said
   * which ones were on. Now one button on the right opens a panel of lists,
   * and what is on shows as chips beside it, each with an × to drop it.
   */
  const [filtersOpen, setFiltersOpen] = useState(false);
  const cityCount = (c: string) =>
    (merchants ?? []).filter((m) => (m.city ?? '').trim() === c).length;
  const filterGroups: FilterGroup[] = [
    {
      key: 'category',
      title: 'نوع المحل',
      value: activeCategory,
      onChange: (v) => {
        setActiveCategory(v);
        setActiveSection(null);
      },
      options: [
        { value: null, label: 'الكل' },
        ...(categories ?? []).map((c) => ({ value: c.id, label: c.nameAr })),
      ],
    },
    ...(cityOptions.length > 1 || activeCity
      ? [
          {
            key: 'city',
            title: 'المدينة',
            value: activeCity,
            onChange: setActiveCity,
            options: [
              { value: null, label: 'كل المدن' },
              ...cityOptions.map((c) => ({ value: c, label: c, count: cityCount(c) })),
            ],
          },
        ]
      : []),
    ...((sections?.length ?? 0) > 0 || activeSection
      ? [
          {
            key: 'section',
            title: 'القسم',
            value: activeSection,
            onChange: setActiveSection,
            options: [
              { value: null, label: 'كل الأقسام' },
              ...(sections ?? []).map((x) => ({ value: x.name, label: x.name, count: x.count })),
            ],
          },
        ]
      : []),
    {
      key: 'sort',
      title: 'الترتيب',
      // «الموصى بها» is the default, so it reads as nothing chosen.
      value: sortKey === 'recommended' ? null : sortKey,
      onChange: (v) => setSortKey((v as SortKey | null) ?? 'recommended'),
      options: (Object.keys(SORT_LABELS) as SortKey[]).map((k) => ({
        value: k === 'recommended' ? null : k,
        label: SORT_LABELS[k],
      })),
    },
  ];
  const activeChips: { key: string; label: string; clear: () => void }[] = [
    ...(activeCategoryName
      ? [
          {
            key: 'category',
            label: activeCategoryName,
            clear: () => {
              setActiveCategory(null);
              setActiveSection(null);
            },
          },
        ]
      : []),
    ...(activeCity ? [{ key: 'city', label: activeCity, clear: () => setActiveCity(null) }] : []),
    ...(activeSection
      ? [{ key: 'section', label: activeSection, clear: () => setActiveSection(null) }]
      : []),
  ];
  const resetFilters = () => {
    setActiveCategory(null);
    setActiveCity(null);
    setActiveSection(null);
    setSortKey('recommended');
  };

  // One product card, reused by the section view and the search-fallback view.
  // The image falls back to the STORE LOGO when the product has no photo (many
  // synced items don't), then to a generic icon.
  const renderProductItem = ({ item }: { item: ProductHit }) => {
    // Same helper as everywhere else, so a % discount and an expired timed
    // offer are honoured here too (this card used to read salePrice raw).
    const pr = productPrice({
      price: item.price ?? 0,
      salePrice: item.salePrice,
      discount: item.discount,
      saleEndsAt: item.saleEndsAt,
    });
    const img = item.imageUrl || item.merchant?.logoUrl || null;
    return (
      <Pressable
        onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <View style={styles.cardIcon}>
          {img ? (
            <Image source={{ uri: img }} style={styles.cardImg} resizeMode="cover" />
          ) : (
            <Package size={22} color={colors.brand.red} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{item.nameAr || item.name || '—'}</Text>
          <View style={styles.cardMeta}>
            <Store size={11} color={colors.text.muted} />
            <Text style={styles.cardSub}>{item.merchant?.storeNameAr ?? '—'}</Text>
          </View>
          {pr.now > 0 && (
            <View style={styles.priceLine}>
              <Text style={styles.priceText}>{pr.now.toFixed(0)} ج.م</Text>
              {pr.was != null && <Text style={styles.wasText}>{pr.was.toFixed(0)}</Text>}
              {pr.off > 0 && (
                <View style={styles.offPill}>
                  <Text
                    style={styles.offPillText}
                  >{`خصم ${Number(pr.off).toLocaleString('ar-EG')}٪`}</Text>
                </View>
              )}
            </View>
          )}
        </View>
        {item.merchant && (
          <View style={item.merchant.isOpen ? styles.tagOpen : styles.tagClosed}>
            <Text style={item.merchant.isOpen ? styles.tagOpenText : styles.tagClosedText}>
              {item.merchant.isOpen ? 'مفتوح' : 'مغلق'}
            </Text>
          </View>
        )}
      </Pressable>
    );
  };

  const productsList = (
    data: ProductHit[] | undefined,
    loading: boolean,
    emptyTitle: string,
    emptySubtitle: string,
  ) =>
    loading && !data ? (
      <View style={styles.listContent}>
        <CardListSkeleton count={5} />
      </View>
    ) : (
      <FlatList
        {...LIST_PERF}
        style={styles.list}
        /* The catalogue is served from disk when the connection drops, so a
           customer can be looking at a week-old list with no way to ask for a
           fresh one. Pull-to-refresh is that way. */
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={() => void refetchMerchants()}
            tintColor={colors.brand.red}
          />
        }
        data={data ?? []}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[
          styles.listContent,
          (data?.length ?? 0) === 0 && { flexGrow: 1, justifyContent: 'center' },
        ]}
        ListEmptyComponent={
          <EmptyState
            icon={<Store size={36} color={colors.brand.red} />}
            title={emptyTitle}
            subtitle={emptySubtitle}
          />
        }
        renderItem={renderProductItem}
      />
    );

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <GradientHeader greeting={activeCategoryName ?? 'المحلات والمطاعم'} location="قفط — قنا" />

      <View style={styles.searchWrap}>
        <Search size={16} color={colors.text.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="ابحث عن محل…"
          placeholderTextColor={colors.text.muted}
          style={styles.searchInput}
        />
      </View>

      {/* One row, starting on the right: the filter button, the sort, then
          whatever is on as chips that drop with one tap. */}
      <View style={styles.toolbar}>
        <Pressable
          onPress={() => setFiltersOpen(true)}
          style={({ pressed }) => [
            styles.filterBtn,
            activeChips.length > 0 && styles.filterBtnOn,
            pressed && { opacity: 0.8 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="فلترة المحلات"
        >
          <SlidersHorizontal
            size={15}
            color={activeChips.length > 0 ? colors.white : colors.brand.red}
          />
          <Text style={[styles.filterBtnText, activeChips.length > 0 && { color: colors.white }]}>
            فلترة
          </Text>
          {activeChips.length > 0 ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeChips.length}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable
          onPress={() => setFiltersOpen(true)}
          style={({ pressed }) => [styles.sortBtn, pressed && { opacity: 0.7 }]}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`ترتيب القائمة، الحالي: ${sortLabel}`}
        >
          <ArrowDownUp size={14} color={colors.brand.red} />
          <Text style={styles.sortText}>{sortLabel}</Text>
        </Pressable>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {activeChips.map((c) => (
            <Pressable
              key={c.key}
              onPress={c.clear}
              style={({ pressed }) => [styles.activeChip, pressed && { opacity: 0.8 }]}
              accessibilityRole="button"
              accessibilityLabel={`شيل فلتر ${c.label}`}
            >
              <Text style={styles.activeChipText} numberOfLines={1}>
                {c.label}
              </Text>
              <X size={13} color={colors.brand.red} />
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <FilterDrawer
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        groups={filterGroups}
        onReset={resetFilters}
        resultLabel={
          activeSection ? `عرض ${(sectionProducts ?? []).length} منتج` : `عرض ${sorted.length} محل`
        }
      />

      {activeSection ? (
        productsList(
          sectionProducts,
          loadingProducts,
          `لا توجد منتجات في "${activeSection}"`,
          'جرّب قسمًا آخر',
        )
      ) : isLoading ? (
        <View style={styles.listContent}>
          <CardListSkeleton count={5} />
        </View>
      ) : isSearching && sorted.length === 0 ? (
        // No store matched the query — show matching PRODUCTS across every
        // store instead of dead-ending on "لا توجد محلات".
        productsList(
          searchProducts,
          loadingSearchProducts,
          `لا توجد نتائج لـ "${debouncedSearch.trim()}"`,
          'جرّب كلمة أخرى',
        )
      ) : (
        <FlatList
          {...LIST_PERF}
          // See the note on the products list above — flex:1 keeps the chips
          // pinned by giving the list its own scroll viewport.
          style={styles.list}
          data={sorted}
          keyExtractor={(m) => m.id}
          contentContainerStyle={[
            styles.listContent,
            sorted.length === 0 && { flexGrow: 1, justifyContent: 'center' },
          ]}
          ListEmptyComponent={
            /* «مفيش محلات متاحة حالياً» after a failed request reads as "Tamem
               has no shops" — the customer closes the app instead of pulling to
               refresh. Say what actually happened and give them the button. */
            merchantsError ? (
              <EmptyState
                icon={<WifiOff size={36} color={colors.danger} />}
                title="تعذّر تحميل المحلات"
                subtitle="تأكد من الاتصال بالإنترنت وحاول تاني."
                actionLabel="إعادة المحاولة"
                onAction={() => void refetchMerchants()}
              />
            ) : (
              <EmptyState
                icon={<Store size={36} color={colors.brand.red} />}
                title={'لا توجد محلات' + (activeCategoryName ? ` في "${activeCategoryName}"` : '')}
                subtitle={
                  activeCategory || search
                    ? 'جرّب فلتر مختلف أو امسح البحث'
                    : 'مفيش محلات متاحة حالياً'
                }
              />
            )
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate('MerchantDetail', { merchantId: item.id })}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.cardIcon}>
                {item.logoUrl ? (
                  <Image source={{ uri: item.logoUrl }} style={styles.cardImg} resizeMode="cover" />
                ) : (
                  <Store size={22} color={colors.brand.red} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.storeNameAr}</Text>
                <View style={styles.cardMeta}>
                  <Star size={11} color={colors.brand.gold} fill={colors.brand.gold} />
                  <Text style={styles.cardSub}>
                    {Number(item.rating ?? 0).toFixed(1)} · {item.category?.nameAr ?? '—'}
                  </Text>
                </View>
                <Text style={styles.cardAddress}>{item.addressLine}</Text>
              </View>
              <View style={item.isOpen ? styles.tagOpen : styles.tagClosed}>
                <Text style={item.isOpen ? styles.tagOpenText : styles.tagClosedText}>
                  {item.isOpen ? 'مفتوح' : 'مغلق'}
                </Text>
              </View>
              <HeartButton merchantId={item.id} merchantName={item.storeNameAr} size="sm" />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  list: { flex: 1 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSizes.sm,
    color: colors.text.primary,
    textAlign: 'right',
    fontFamily: fontFamilies.body,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingStart: spacing.lg,
    paddingVertical: spacing.md,
  },
  chipsRow: {
    gap: spacing.xs,
    paddingEnd: spacing.lg,
    alignItems: 'center',
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    minHeight: 36,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.brand.red,
    backgroundColor: colors.white,
  },
  filterBtnOn: { backgroundColor: colors.brand.red },
  filterBtnText: {
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xs,
  },
  filterBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: 11,
    includeFontPadding: false,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brand.redLight,
    paddingHorizontal: spacing.md,
    minHeight: 36,
    borderRadius: radii.pill,
  },
  sortText: {
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xs,
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 170,
    paddingHorizontal: spacing.sm,
    minHeight: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line2,
  },
  activeChipText: {
    color: colors.ink,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
    flexShrink: 1,
  },
  priceLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  wasText: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    textDecorationLine: 'line-through',
  },
  offPill: {
    backgroundColor: '#FDECEA',
    borderRadius: radii.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  offPillText: { fontSize: 10, color: colors.brand.red, fontFamily: fontFamilies.bodyExtraBold },
  priceText: {
    fontSize: fontSizes.sm,
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
    marginTop: 3,
  },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  empty: {
    textAlign: 'center',
    color: colors.text.muted,
    marginTop: spacing.xl,
    fontFamily: fontFamilies.body,
  },
  card: {
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
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardImg: { width: '100%', height: '100%' },
  cardTitle: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
  },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  cardSub: { fontSize: fontSizes.xs, color: colors.text.muted, fontFamily: fontFamilies.body },
  cardAddress: {
    fontSize: 10,
    color: colors.text.muted,
    marginTop: 2,
    fontFamily: fontFamilies.body,
  },
  pressed: { opacity: 0.85 },
  tagOpen: {
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  tagOpenText: {
    color: colors.success,
    fontSize: 10,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  tagClosed: {
    backgroundColor: '#F3F3F3',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  tagClosedText: {
    color: colors.text.muted,
    fontSize: 10,
    fontFamily: fontFamilies.bodyExtraBold,
  },
});
