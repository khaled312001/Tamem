import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Heart, Store } from 'lucide-react-native';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HeartButton } from '../components/HeartButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { AnimatedListItem, CardListSkeleton, EmptyState } from '../components/ui';
import { useFavoriteIds } from '../lib/favorites';
import { api } from '../lib/api';
import { colors, fontFamilies, fontSizes, radii, shadows, spacing } from '../theme/tokens';

interface Merchant {
  id: string;
  storeNameAr: string;
  rating?: number | null;
  isOpen: boolean;
  category?: { nameAr: string };
}

export function FavoritesScreen() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navigation = useNavigation<any>();
  const favoriteIds = useFavoriteIds();

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

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader title="المفضلة" subtitle="المتاجر اللي اخترتها" />

      {isLoading ? (
        <View style={styles.listPad}>
          <CardListSkeleton count={4} />
        </View>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(m) => m.id}
          contentContainerStyle={[
            styles.listPad,
            favorites.length === 0 && { flexGrow: 1, justifyContent: 'center' },
          ]}
          ListEmptyComponent={
            <EmptyState
              icon={<Heart size={36} color={colors.brand.red} />}
              title="مفيش متاجر في المفضلة بعد"
              subtitle="اضغط على ❤️ بجانب أي متجر في الصفحة الرئيسية عشان تحفظه هنا."
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
                    <Text style={styles.star}>★</Text>
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
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
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
  star: { fontSize: 12, color: colors.brand.gold },
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
});
