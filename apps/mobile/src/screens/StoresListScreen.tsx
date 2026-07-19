import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownUp, Search, Star, Store } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientHeader } from '../components/GradientHeader';
import { HeartButton } from '../components/HeartButton';
import { CardListSkeleton, EmptyState } from '../components/ui';
import { api } from '../lib/api';
import { LIST_PERF } from '../lib/listPerf';
import { useDebouncedValue } from '../lib/useDebouncedValue';
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
            onPress={() => setActiveCategory(null)}
            style={[styles.chip, !activeCategory && styles.chipOn]}
          >
            <Text style={[styles.chipText, !activeCategory && styles.chipTextOn]}>الكل</Text>
          </Pressable>
          {(categories ?? []).map((c) => {
            const isOn = activeCategory === c.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => setActiveCategory(isOn ? null : c.id)}
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

      {isLoading ? (
        <View style={styles.listContent}>
          <CardListSkeleton count={5} />
        </View>
      ) : (
        <FlatList
          {...LIST_PERF}
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
  },
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
