/**
 * "عروض اليوم" — the full deals grid opened from the home rail's "عرض الكل".
 *
 * Shows every live discounted product (the server already drops expired timed
 * offers), each with its countdown, discount badge and struck-through list
 * price. When a card's timer expires it refetches, so the now full-price item
 * leaves the grid on its own.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { Tag } from 'lucide-react-native';
import { useCallback } from 'react';
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CountdownBadge } from '../components/CountdownBadge';
import { ScreenHeader } from '../components/ScreenHeader';
import { CardListSkeleton, EmptyState } from '../components/ui';
import { api } from '../lib/api';
import { LIST_PERF } from '../lib/listPerf';
import { productPrice } from '../lib/productPrice';
import type { HomeStackParamList } from '../navigation/HomeStack';
import { colors, fontFamilies, radii, shadows, spacing } from '../theme/tokens';

const ROW = 'row' as const;

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Deals'>;

interface Deal {
  id: string;
  nameAr?: string | null;
  name?: string | null;
  price: number | string;
  salePrice?: number | string | null;
  discount?: number | string | null;
  saleEndsAt?: string | null;
  imageUrl?: string | null;
  merchant?: { id: string; storeNameAr?: string | null; logoUrl?: string | null };
}

export function DealsScreen() {
  const navigation = useNavigation<Nav>();

  const { data, isLoading, isFetching, refetch } = useQuery<Deal[]>({
    queryKey: ['all-deals'],
    queryFn: () =>
      api.raw
        .get('/products', { params: { onSale: 1, pageSize: 50 } })
        .then((r) => (r.data?.data ?? []) as Deal[]),
    staleTime: 30_000,
  });

  const deals = data ?? [];

  const renderItem = useCallback(
    ({ item }: { item: Deal }) => {
      const price = productPrice(item);
      const img = item.imageUrl || item.merchant?.logoUrl || null;
      return (
        <Pressable
          onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
          style={({ pressed }) => [styles.card, shadows.sm, pressed && { opacity: 0.9 }]}
          accessibilityRole="button"
          accessibilityLabel={item.nameAr ?? ''}
        >
          <View style={styles.imgWrap}>
            {img ? (
              <Image source={{ uri: img }} style={styles.img} resizeMode="cover" />
            ) : (
              <View style={styles.imgFallback}>
                <Tag size={24} color={colors.brand.red} />
              </View>
            )}
            {price.off > 0 && (
              <View style={styles.offBadge}>
                <Text style={styles.offText}>-{price.off}%</Text>
              </View>
            )}
            {!!item.saleEndsAt && (
              <View style={styles.timer}>
                <CountdownBadge endsAt={item.saleEndsAt} onExpire={refetch} />
              </View>
            )}
          </View>

          <Text style={styles.name} numberOfLines={2}>
            {item.nameAr || item.name || '—'}
          </Text>
          {!!item.merchant?.storeNameAr && (
            <Text style={styles.store} numberOfLines={1}>
              {item.merchant.storeNameAr}
            </Text>
          )}
          <View style={[styles.priceRow, { flexDirection: ROW }]}>
            <Text style={styles.price}>{Math.round(price.now).toLocaleString('ar-EG')} ج.م</Text>
            {price.was != null && (
              <Text style={styles.was}>{Math.round(price.was).toLocaleString('ar-EG')}</Text>
            )}
          </View>
        </Pressable>
      );
    },
    [navigation, refetch],
  );

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader title="عروض اليوم" subtitle="خصومات سارية الآن — لفترة محدودة" />

      {isLoading ? (
        <View style={styles.pad}>
          <CardListSkeleton count={6} />
        </View>
      ) : (
        <FlatList
          {...LIST_PERF}
          data={deals}
          keyExtractor={(d) => d.id}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={styles.column}
          contentContainerStyle={[
            styles.listContent,
            deals.length === 0 && { flexGrow: 1, justifyContent: 'center' },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={refetch}
              tintColor={colors.brand.red}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon={<Tag size={36} color={colors.brand.red} />}
              title="لا توجد عروض حالياً"
              subtitle="تابعنا — العروض بتتجدد باستمرار"
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const CARD_GAP = spacing.md;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  pad: { padding: spacing.lg },
  listContent: { padding: spacing.lg, gap: CARD_GAP },
  column: { gap: CARD_GAP },

  card: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#EFE7E2',
    padding: spacing.sm,
  },
  imgWrap: {
    height: 130,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: '#F6F0EC',
    marginBottom: spacing.sm,
  },
  img: { width: '100%', height: '100%' },
  imgFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  offBadge: {
    position: 'absolute',
    top: 6,
    insetInlineEnd: 6,
    backgroundColor: colors.brand.red,
    borderRadius: radii.sm,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  offText: { color: colors.white, fontSize: 11, fontFamily: fontFamilies.bodyExtraBold },
  timer: { position: 'absolute', bottom: 6, insetInlineStart: 6 },

  name: {
    fontSize: 13,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyExtraBold,
    lineHeight: 20,
    includeFontPadding: false,
    textAlign: 'auto',
    minHeight: 40,
  },
  store: {
    fontSize: 11,
    color: colors.brand.gray,
    fontFamily: fontFamilies.body,
    lineHeight: 17,
    includeFontPadding: false,
    textAlign: 'auto',
  },
  priceRow: { alignItems: 'center', gap: 6, marginTop: 4 },
  price: {
    fontSize: 14,
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
    lineHeight: 21,
    includeFontPadding: false,
  },
  was: {
    fontSize: 11,
    color: colors.brand.gray,
    fontFamily: fontFamilies.body,
    textDecorationLine: 'line-through',
    lineHeight: 17,
    includeFontPadding: false,
  },
});
