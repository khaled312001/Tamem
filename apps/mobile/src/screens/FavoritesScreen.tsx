import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, LogIn, ShoppingBag, Star, Store } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Image } from '../components/ui/CachedImage';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/ScreenHeader';
import { AnimatedListItem, CardListSkeleton, EmptyState, MoneyText } from '../components/ui';
import { api } from '../lib/api';
import {
  toggleFavoriteIn,
  syncFavoritesWithServer,
  type FavoriteCollection,
} from '../lib/favorites';
import { haptic } from '../lib/haptics';
import { LIST_PERF } from '../lib/listPerf';
import { productPrice } from '../lib/productPrice';
import { useAuth } from '../stores/auth';
import { colors, fontFamilies, fontSizes, palette, radii, shadows, spacing } from '../theme/tokens';

interface FavMerchant {
  id: string;
  storeNameAr: string;
  logoUrl?: string | null;
  rating?: number | null;
  isOpen: boolean;
  category?: { nameAr: string } | null;
}

interface FavProduct {
  id: string;
  nameAr: string;
  price: number | string;
  salePrice?: number | string | null;
  discount?: number | string | null;
  saleEndsAt?: string | null;
  imageUrl?: string | null;
  merchant?: { id: string; storeNameAr: string } | null;
}

interface FavData {
  merchant: FavMerchant[];
  product: FavProduct[];
}

type Tab = 'merchants' | 'products';

export function FavoritesScreen() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navigation = useNavigation<any>();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const [tab, setTab] = useState<Tab>('merchants');

  const { data, isLoading, isRefetching, refetch } = useQuery<FavData>({
    queryKey: ['me-favorites'],
    queryFn: () => api.raw.get('/me/favorites').then((r) => r.data.data as FavData),
    enabled: !!user,
    // Server is the source of truth; a store's rating/openness can change.
    staleTime: 30_000,
    refetchOnMount: 'always',
  });

  const merchants = data?.merchant ?? [];
  const products = data?.product ?? [];

  // Remove instantly from the visible list AND flip the global heart (so the
  // icon empties everywhere), then let the server call trail behind.
  const remove = (collection: FavoriteCollection, id: string) => {
    haptic.tap();
    void toggleFavoriteIn(collection, id);
    qc.setQueryData<FavData>(['me-favorites'], (old) => {
      if (!old) return old;
      if (collection === 'merchant') {
        return { ...old, merchant: old.merchant.filter((x) => x.id !== id) };
      }
      return { ...old, product: old.product.filter((x) => x.id !== id) };
    });
  };

  const onRefresh = () => {
    void syncFavoritesWithServer();
    void refetch();
  };

  const goStores = () => navigation.getParent()?.navigate('HomeTab', { screen: 'StoresList' });

  // Not signed in → favourites live on the account, so prompt to log in.
  if (!user) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScreenHeader title="المفضلة" subtitle="المتاجر والمنتجات اللي اخترتها" />
        <EmptyState
          icon={<LogIn size={36} color={colors.brand.red} />}
          title="سجّل الدخول لعرض مفضلتك"
          subtitle="مفضلتك محفوظة على حسابك وبتتزامن على كل أجهزتك."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader title="المفضلة" subtitle="محفوظة على حسابك ومتزامنة على كل أجهزتك" />

      {/* Tab switcher */}
      <View style={styles.tabBar}>
        {[
          { key: 'merchants' as const, label: 'المتاجر', n: merchants.length },
          { key: 'products' as const, label: 'قائمة الرغبات', n: products.length },
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
                {t.label}
                {t.n > 0 ? `  ${t.n.toLocaleString('ar-EG')}` : ''}
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
          data={merchants}
          keyExtractor={(m) => m.id}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor={colors.brand.red}
              colors={[colors.brand.red]}
            />
          }
          contentContainerStyle={[styles.listPad, merchants.length === 0 && styles.emptyPad]}
          ListEmptyComponent={
            <EmptyState
              icon={<Heart size={36} color={colors.brand.red} />}
              title="مفيش متاجر في المفضلة بعد"
              subtitle="اضغط على أيقونة القلب بجانب أي متجر عشان تحفظه هنا."
              actionLabel="تصفح المتاجر"
              onAction={goStores}
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
                style={({ pressed }) => [styles.card, shadows.sm, pressed && styles.pressed]}
              >
                <View style={styles.thumb}>
                  {item.logoUrl ? (
                    <Image
                      source={{ uri: item.logoUrl }}
                      style={styles.thumbImg}
                      resizeMode="cover"
                    />
                  ) : (
                    <Store size={22} color={colors.brand.red} />
                  )}
                </View>
                <View style={styles.info}>
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
                <RemoveHeart onPress={() => remove('merchant', item.id)} />
              </Pressable>
            </AnimatedListItem>
          )}
        />
      ) : (
        <FlatList
          {...LIST_PERF}
          data={products}
          keyExtractor={(p) => p.id}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor={colors.brand.red}
              colors={[colors.brand.red]}
            />
          }
          contentContainerStyle={[styles.listPad, products.length === 0 && styles.emptyPad]}
          ListEmptyComponent={
            <EmptyState
              icon={<ShoppingBag size={36} color={colors.brand.red} />}
              title="قائمة الرغبات فاضية"
              subtitle="افتح أي منتج واضغط على القلب عشان تحفظه للطلب بعدين."
              actionLabel="تصفح المتاجر"
              onAction={goStores}
            />
          }
          renderItem={({ item, index }) => {
            const pr = productPrice({
              price: item.price ?? 0,
              salePrice: item.salePrice,
              discount: item.discount,
              saleEndsAt: item.saleEndsAt,
            });
            return (
              <AnimatedListItem index={index}>
                <Pressable
                  onPress={() =>
                    navigation.getParent()?.navigate('HomeTab', {
                      screen: 'ProductDetail',
                      params: { productId: item.id },
                    })
                  }
                  style={({ pressed }) => [styles.card, shadows.sm, pressed && styles.pressed]}
                >
                  <View style={styles.productThumb}>
                    {item.imageUrl ? (
                      <Image
                        source={{ uri: item.imageUrl }}
                        style={styles.thumbImg}
                        resizeMode="cover"
                      />
                    ) : (
                      <ShoppingBag size={22} color={colors.brand.red} />
                    )}
                  </View>
                  <View style={styles.info}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.nameAr}
                    </Text>
                    {!!item.merchant?.storeNameAr && (
                      <Text style={styles.meta} numberOfLines={1}>
                        من {item.merchant.storeNameAr}
                      </Text>
                    )}
                    <View style={styles.priceRow}>
                      <MoneyText amount={pr.now} tone="brand" size="sm" />
                      {pr.was != null && (
                        <Text style={styles.wasPrice}>
                          {Math.round(pr.was).toLocaleString('ar-EG')}
                        </Text>
                      )}
                      {pr.off > 0 && (
                        <View style={styles.offPill}>
                          <Text style={styles.offPillText}>
                            {`خصم ${Number(pr.off).toLocaleString('ar-EG')}٪`}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <RemoveHeart onPress={() => remove('product', item.id)} />
                </Pressable>
              </AnimatedListItem>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

/** Filled heart that removes the item from favourites. */
function RemoveHeart({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={styles.removeBtn}
      accessibilityRole="button"
      accessibilityLabel="إزالة من المفضلة"
    >
      <Heart size={20} color={colors.brand.red} fill={colors.brand.red} />
    </Pressable>
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
  tabActive: { backgroundColor: palette.red[50], borderColor: palette.red[500] },
  tabLabel: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
    color: colors.text.secondary,
  },
  tabLabelActive: { color: palette.red[700] },

  listPad: { padding: spacing.lg, paddingBottom: spacing.xxl },
  emptyPad: { flexGrow: 1, justifyContent: 'center' },
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
  pressed: { opacity: 0.92 },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  productThumb: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImg: { width: '100%', height: '100%' },
  info: { flex: 1, gap: 2 },
  name: { fontFamily: fontFamilies.bodyExtraBold, color: colors.ink, fontSize: fontSizes.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  meta: { fontSize: fontSizes.xs, color: colors.text.muted, fontFamily: fontFamilies.body },
  metaDot: { color: colors.text.muted, fontFamily: fontFamilies.body },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  wasPrice: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    textDecorationLine: 'line-through',
  },
  offPill: {
    backgroundColor: '#FDECEA',
    borderRadius: radii.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  offPillText: { fontSize: 10, color: colors.brand.red, fontFamily: fontFamilies.bodyExtraBold },
  openTag: {
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  openTagText: { color: colors.success, fontFamily: fontFamilies.bodyExtraBold, fontSize: 10 },
  closedTag: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  closedTagText: { color: colors.text.muted, fontFamily: fontFamilies.bodyExtraBold, fontSize: 10 },
  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.redLight,
  },
});
