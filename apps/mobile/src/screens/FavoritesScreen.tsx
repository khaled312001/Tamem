import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Heart, ShoppingBag, Star, Store } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HeartButton } from '../components/HeartButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { AnimatedListItem, CardListSkeleton, EmptyState, MoneyText } from '../components/ui';
import { useFavoriteIds, useFavoriteIdsOf } from '../lib/favorites';
import { api } from '../lib/api';
import { LIST_PERF } from '../lib/listPerf';
import { colors, fontFamilies, fontSizes, palette, radii, shadows, spacing } from '../theme/tokens';

interface Merchant {
  id: string;
  storeNameAr: string;
  rating?: number | null;
  isOpen: boolean;
  category?: { nameAr: string };
  products?: Array<{ id: string; nameAr: string; price: number; imageUrl?: string | null }>;
}

interface ProductRow {
  id: string;
  nameAr: string;
  price: number;
  imageUrl?: string | null;
  storeNameAr: string;
  merchantId: string;
}

type Tab = 'merchants' | 'products';

export function FavoritesScreen() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navigation = useNavigation<any>();
  const favoriteIds = useFavoriteIds();
  const wishlistIds = useFavoriteIdsOf('product');
  const [tab, setTab] = useState<Tab>('merchants');

  // Single fetch for all merchants — small list, cheaper than N round-trips.
  // We then filter client-side to favoriteIds.
  const { data: allMerchants, isLoading } = useQuery<Merchant[]>({
    queryKey: ['merchants'],
    queryFn: () => api.raw.get('/merchants').then((r) => r.data.data),
    staleTime: 60_000,
  });

  const favorites = useMemo(() => {
    if (!allMerchants) return [];
    const set = new Set(favoriteIds);
    return allMerchants.filter((m) => set.has(m.id));
  }, [allMerchants, favoriteIds]);

  // Flatten every merchant's products into a single list, then filter to the
  // wishlisted product IDs. We carry storeNameAr along so the row can show
  // both the product and which store it's from.
  const wishlist = useMemo<ProductRow[]>(() => {
    if (!allMerchants || wishlistIds.length === 0) return [];
    const set = new Set(wishlistIds);
    const rows: ProductRow[] = [];
    for (const m of allMerchants) {
      for (const p of m.products ?? []) {
        if (set.has(p.id)) {
          rows.push({
            id: p.id,
            nameAr: p.nameAr,
            price: Number(p.price),
            imageUrl: p.imageUrl ?? null,
            storeNameAr: m.storeNameAr,
            merchantId: m.id,
          });
        }
      }
    }
    return rows;
  }, [allMerchants, wishlistIds]);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader title="المفضلة" subtitle="المتاجر والمنتجات اللي اخترتها" />

      {/* Tab switcher: merchants vs products */}
      <View style={styles.tabBar}>
        {[
          { key: 'merchants' as const, label: 'المتاجر', count: favorites.length },
          { key: 'products' as const, label: 'قائمة الرغبات', count: wishlist.length },
        ].map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.tab, active && styles.tabActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {t.label} {t.count > 0 ? `(${t.count})` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <View style={styles.listPad}>
          <CardListSkeleton count={4} />
        </View>
      ) : tab === 'merchants' ? (
        <FlatList
          {...LIST_PERF}
          data={favorites}
          keyExtractor={(m) => m.id}
          contentContainerStyle={[
            styles.listPad,
            favorites.length === 0 && { flexGrow: 1, justifyContent: 'center' },
          ]}
          ListHeaderComponent={
            favorites.length > 0 ? (
              <View style={styles.localBanner}>
                <Text style={styles.localBannerText}>
                  ℹ️ المفضلة محفوظة على هذا الجهاز فقط دلوقتي. لو حذفت التطبيق أو غيّرت الموبايل
                  هتحتاج تضيفها تاني.
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon={<Heart size={36} color={colors.brand.red} />}
              title="مفيش متاجر في المفضلة بعد"
              subtitle="اضغط على أيقونة القلب بجانب أي متجر في الصفحة الرئيسية عشان تحفظه هنا."
              actionLabel="تصفح المتاجر"
              onAction={() => {
                navigation.getParent()?.navigate('HomeTab', {
                  screen: 'StoresList',
                });
              }}
            />
          }
          renderItem={({ item, index }) => (
            <AnimatedListItem index={index}>
              <Pressable
                onPress={() =>
                  navigation.getParent()?.navigate('HomeTab', {
                    screen: 'MerchantDetail',
                    params: { merchantId: item.id },
                  })
                }
                style={({ pressed }) => [styles.card, shadows.sm, pressed && { opacity: 0.92 }]}
              >
                <View style={styles.thumb}>
                  <Store size={22} color={colors.brand.red} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.storeNameAr}
                  </Text>
                  <View style={styles.metaRow}>
                    <Star size={12} color={colors.brand.gold} fill={colors.brand.gold} />
                    <Text style={styles.meta}>{Number(item.rating ?? 0).toFixed(1)}</Text>
                    <Text style={styles.metaDot}>·</Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {item.category?.nameAr ?? '—'}
                    </Text>
                  </View>
                </View>
                <View style={item.isOpen ? styles.openTag : styles.closedTag}>
                  <Text style={item.isOpen ? styles.openTagText : styles.closedTagText}>
                    {item.isOpen ? 'مفتوح' : 'مغلق'}
                  </Text>
                </View>
                <HeartButton merchantId={item.id} merchantName={item.storeNameAr} size="sm" />
              </Pressable>
            </AnimatedListItem>
          )}
        />
      ) : (
        <FlatList
          {...LIST_PERF}
          data={wishlist}
          keyExtractor={(p) => p.id}
          contentContainerStyle={[
            styles.listPad,
            wishlist.length === 0 && { flexGrow: 1, justifyContent: 'center' },
          ]}
          ListEmptyComponent={
            <EmptyState
              icon={<ShoppingBag size={36} color={colors.brand.red} />}
              title="قائمة الرغبات فاضية"
              subtitle="افتح أي متجر واضغط على أيقونة القلب بجانب المنتج اللي عاوز تحفظه."
              actionLabel="تصفح المتاجر"
              onAction={() => {
                navigation.getParent()?.navigate('HomeTab', {
                  screen: 'StoresList',
                });
              }}
            />
          }
          renderItem={({ item, index }) => (
            <AnimatedListItem index={index}>
              <Pressable
                onPress={() =>
                  navigation.getParent()?.navigate('HomeTab', {
                    screen: 'MerchantDetail',
                    params: { merchantId: item.merchantId },
                  })
                }
                style={({ pressed }) => [styles.card, shadows.sm, pressed && { opacity: 0.92 }]}
              >
                <View style={styles.productThumb}>
                  {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={styles.productThumbImg} />
                  ) : (
                    <ShoppingBag size={22} color={colors.brand.red} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.nameAr}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    من {item.storeNameAr}
                  </Text>
                </View>
                <MoneyText amount={item.price} tone="brand" size="sm" />
                <HeartButton
                  collection="product"
                  id={item.id}
                  merchantName={item.nameAr}
                  size="sm"
                />
              </Pressable>
            </AnimatedListItem>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  tabBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line2,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: palette.red[50],
    borderColor: palette.red[500],
  },
  tabLabel: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
    color: colors.text.secondary,
  },
  tabLabelActive: { color: palette.red[700] },
  productThumb: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  productThumbImg: { width: '100%', height: '100%' },
  listPad: { padding: spacing.lg, paddingBottom: spacing.xxl },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: spacing.sm,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
    fontSize: fontSizes.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  meta: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
  },
  metaDot: {
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
  },
  openTag: {
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  openTagText: {
    color: colors.success,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: 10,
  },
  closedTag: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  closedTagText: {
    color: colors.text.muted,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: 10,
  },
  localBanner: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  localBannerText: {
    color: colors.text.secondary,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    lineHeight: 18,
  },
});
