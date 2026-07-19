/**
 * "الأكثر طلباً" — horizontal merchant rail.
 *
 * Data (and its ordering, which honours the admin's pinned featuredMerchantIds)
 * arrives from HomeV2Screen; this file only lays it out. Favourites keep using
 * the existing HeartButton, so the same store is in sync everywhere.
 */
import { Clock, ImageOff, Star } from 'lucide-react-native';
import { memo, useCallback } from 'react';
import { FlatList, I18nManager, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { HeartButton } from '../../../components/HeartButton';
import { LIST_PERF } from '../../../lib/listPerf';
import { colors, fontFamilies, radii, shadows, spacing } from '../../../theme/tokens';
import type { Merchant } from '../homeData';

// React Native already lays `flexDirection: 'row'` out right-to-left when
// I18nManager RTL is on. Adding 'row-reverse' on top of that flips it a
// SECOND time, back to left-to-right — which is why the header rendered
// mirrored. Plain 'row' is correct on native; the web build gets its
// direction from the document's dir="rtl".
const ROW = 'row' as const;
const CARD_W = 168;
const COVER_H = 104;

interface Props {
  merchants: Merchant[];
  onPressMerchant: (m: Merchant) => void;
  onPressSeeAll: () => void;
}

const StoreCard = memo(function StoreCard({ m, onPress }: { m: Merchant; onPress: () => void }) {
  // Prefer the server's computed openness over the raw toggle.
  const isOpen = m.openness?.isOpenNow ?? m.isOpen;
  const cover = m.coverUrl || m.logoUrl || null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={m.storeNameAr}
    >
      <View style={styles.cover}>
        {cover ? (
          <Image
            source={{ uri: cover }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            accessible={false}
          />
        ) : (
          <View style={styles.coverFallback}>
            <ImageOff size={26} color="#C9BDB5" />
          </View>
        )}

        <View style={styles.heart}>
          <HeartButton merchantId={m.id} merchantName={m.storeNameAr} size="sm" />
        </View>

        {!!m.hasOffers && (
          <View style={styles.offerBadge}>
            <Text style={styles.offerBadgeText}>عرض</Text>
          </View>
        )}
      </View>

      <Text style={styles.name} numberOfLines={1}>
        {m.storeNameAr}
      </Text>
      <Text style={styles.category} numberOfLines={1}>
        {m.category?.nameAr ?? '—'}
      </Text>

      <View style={[styles.metaRow, { flexDirection: ROW }]}>
        <View style={[styles.meta, { flexDirection: ROW }]}>
          <Star size={12} color={colors.brand.gold} fill={colors.brand.gold} />
          <Text style={styles.metaText}>{Number(m.rating ?? 0).toFixed(1)}</Text>
        </View>
        {m.etaMinutes != null && (
          <View style={[styles.meta, { flexDirection: ROW }]}>
            <Clock size={12} color={colors.brand.gray} />
            <Text style={styles.metaText}>{m.etaMinutes}د</Text>
          </View>
        )}
      </View>

      <Text style={[styles.status, isOpen ? styles.open : styles.closed]} numberOfLines={1}>
        {isOpen ? 'مفتوح' : 'مغلق'}
        {m.deliveryFee != null ? ` · توصيل ${m.deliveryFee} ج.م` : ''}
      </Text>
    </Pressable>
  );
});

function PopularStoresSectionBase({ merchants, onPressMerchant, onPressSeeAll }: Props) {
  const renderItem = useCallback(
    ({ item }: { item: Merchant }) => <StoreCard m={item} onPress={() => onPressMerchant(item)} />,
    [onPressMerchant],
  );
  const keyExtractor = useCallback((m: Merchant) => m.id, []);

  return (
    <View>
      <View style={[styles.header, { flexDirection: ROW }]}>
        <Text style={styles.sectionTitle}>متاجر مختارة</Text>
        <Pressable onPress={onPressSeeAll} hitSlop={8} accessibilityRole="button">
          <Text style={styles.seeAll}>عرض الكل</Text>
        </Pressable>
      </View>

      {merchants.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>لا توجد متاجر متاحة حالياً</Text>
        </View>
      ) : (
        <FlatList
          {...LIST_PERF}
          // Cards carry remote cover images; clipping them offscreen is where
          // the memory win is on a long rail.
          data={merchants}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

export const PopularStoresSection = memo(PopularStoresSectionBase);

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyExtraBold,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  seeAll: {
    fontSize: 13,
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyBold,
  },
  listContent: { gap: spacing.md, paddingVertical: 2 },

  card: {
    width: CARD_W,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#EFE7E2',
    padding: spacing.sm,
    ...shadows.sm,
  },
  cover: {
    height: COVER_H,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: '#F6F0EC',
    marginBottom: spacing.sm,
  },
  coverFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heart: {
    position: 'absolute',
    top: 6,
    ...(I18nManager.isRTL ? { left: 6 } : { right: 6 }),
  },
  offerBadge: {
    position: 'absolute',
    bottom: 6,
    ...(I18nManager.isRTL ? { right: 6 } : { left: 6 }),
    backgroundColor: colors.brand.red,
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  offerBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontFamily: fontFamilies.bodyExtraBold,
  },

  name: {
    fontSize: 14,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyExtraBold,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  category: {
    fontSize: 12,
    color: colors.brand.gray,
    fontFamily: fontFamilies.body,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  metaRow: { alignItems: 'center', gap: spacing.md, marginTop: 4 },
  meta: { alignItems: 'center', gap: 3 },
  metaText: {
    fontSize: 12,
    color: colors.brand.gray,
    fontFamily: fontFamilies.bodyBold,
  },
  status: {
    marginTop: 4,
    fontSize: 11,
    fontFamily: fontFamilies.bodyBold,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  open: { color: '#20A85B' },
  closed: { color: colors.brand.gray },

  empty: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    borderRadius: radii.lg,
    backgroundColor: '#FAF6F3',
  },
  emptyText: {
    fontSize: 13,
    color: colors.brand.gray,
    fontFamily: fontFamilies.body,
  },
  pressed: { opacity: 0.85 },
});
