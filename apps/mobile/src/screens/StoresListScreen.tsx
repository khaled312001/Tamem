import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownUp, Package, Search, Star, Store } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

interface Merchant {
  id: string;
  storeNameAr: string;
  addressLine: string;
  rating?: number | null;
  isOpen: boolean;
  category?: { id: string; nameAr: string };
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

  const { data: merchants, isLoading } = useQuery<Merchant[]>({
    queryKey: ['merchants', activeCategory, debouncedSearch],
    queryFn: () => {
      const params: Record<string, string> = {};
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

  const sorted = useMemo(() => {
    const list = (merchants ?? []).slice();
    if (sortKey === 'rating') {
      list.sort((a, b) => Number(b.rating ?? 0) - Number(a.rating ?? 0));
    } else if (sortKey === 'open') {
      list.sort((a, b) => Number(b.isOpen) - Number(a.isOpen));
    }
    return list;
  }, [merchants, sortKey]);

  const cycleSort = () => {
    setSortKey((k) => (k === 'recommended' ? 'rating' : k === 'rating' ? 'open' : 'recommended'));
  };
  const sortLabel =
    sortKey === 'rating' ? 'الأعلى تقييماً' : sortKey === 'open' ? 'المفتوحة أولاً' : 'الموصى بها';

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
                  <Text style={styles.offPillText}>-{pr.off}%</Text>
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

      <View style={styles.toolbar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          <Pressable
            onPress={() => {
              setActiveCategory(null);
              setActiveSection(null);
            }}
            style={[styles.chip, !activeCategory && styles.chipOn]}
          >
            <Text style={[styles.chipText, !activeCategory && styles.chipTextOn]}>الكل</Text>
          </Pressable>
          {(categories ?? []).map((c) => {
            const isOn = activeCategory === c.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => {
                  setActiveCategory(isOn ? null : c.id);
                  setActiveSection(null);
                }}
                style={[styles.chip, isOn && styles.chipOn]}
              >
                <Text style={[styles.chipText, isOn && styles.chipTextOn]}>{c.nameAr}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable
          onPress={cycleSort}
          style={({ pressed }) => [styles.sortBtn, pressed && { opacity: 0.7 }]}
          hitSlop={6}
          accessibilityLabel="ترتيب القائمة"
        >
          <ArrowDownUp size={14} color={colors.brand.red} />
          <Text style={styles.sortText}>{sortLabel}</Text>
        </Pressable>
      </View>

      {/* Shared sections (مشويات، بيتزا…) filtered across every merchant. */}
      {(sections?.length ?? 0) > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sectionRow}
          style={styles.sectionScroll}
        >
          <Pressable
            onPress={() => setActiveSection(null)}
            style={[styles.sectionChip, !activeSection && styles.sectionChipOn]}
          >
            <Text style={[styles.sectionChipText, !activeSection && styles.sectionChipTextOn]}>
              كل الأقسام
            </Text>
          </Pressable>
          {(sections ?? []).map((s) => {
            const on = activeSection === s.name;
            return (
              <Pressable
                key={s.name}
                onPress={() => setActiveSection(on ? null : s.name)}
                style={[styles.sectionChip, on && styles.sectionChipOn]}
              >
                <Text style={[styles.sectionChipText, on && styles.sectionChipTextOn]}>
                  {s.name} · {s.count}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

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
            <EmptyState
              icon={<Store size={36} color={colors.brand.red} />}
              title={'لا توجد محلات' + (activeCategoryName ? ` في "${activeCategoryName}"` : '')}
              subtitle={
                activeCategory || search
                  ? 'جرّب فلتر مختلف أو امسح البحث'
                  : 'مفيش محلات متاحة حالياً'
              }
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate('MerchantDetail', { merchantId: item.id })}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.cardIcon}>
                <Store size={22} color={colors.brand.red} />
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
    gap: spacing.sm,
    paddingEnd: spacing.lg,
  },
  chipsRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brand.redLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  sortText: {
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xs,
  },
  chip: {
    backgroundColor: colors.soft,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    marginEnd: spacing.xs,
  },
  chipOn: { backgroundColor: colors.brand.red },
  chipText: {
    color: colors.ink,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyBold,
  },
  chipTextOn: { color: colors.white },
  sectionScroll: { flexGrow: 0 },
  sectionRow: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  sectionChip: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.brand.red,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radii.pill,
    marginEnd: spacing.xs,
  },
  sectionChipOn: { backgroundColor: colors.brand.red },
  sectionChipText: {
    color: colors.brand.red,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyBold,
  },
  sectionChipTextOn: { color: colors.white },
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
