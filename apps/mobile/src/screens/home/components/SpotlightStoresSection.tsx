/**
 * «مطاعم قنا» — the showcase rail that opens the home screen.
 *
 * Why this is a home section and NOT a new merchant category: a merchant
 * carries exactly one `categoryId`, so a second "مطاعم قنا" category would have
 * to TAKE the restaurants out of "مطاعم" — they would vanish from the main
 * restaurants listing, from its store count, and from anything filtering on it.
 * A section is presentation, so the same restaurant can headline here and still
 * live under مطاعم everywhere else.
 *
 * It also costs no extra request: HomeV2Screen already holds the merchant list,
 * and this rail is a filter over it.
 *
 * The card is deliberately bigger and darker than the ones further down the
 * page. This is the first thing a customer sees, so it leads with food
 * photography — name, rating and delivery sit ON the image under a scrim rather
 * than in a caption block, which is what makes it read as a showcase instead of
 * one more list.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Clock, ImageOff, Star, UtensilsCrossed } from 'lucide-react-native';
import { memo, useCallback } from 'react';
import { FlatList, I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';

import { Image } from '../../../components/ui/CachedImage';
import { HeartButton } from '../../../components/HeartButton';
import { LIST_PERF } from '../../../lib/listPerf';
import { colors, fontFamilies, radii, shadows, spacing } from '../../../theme/tokens';

import { SectionHeader } from './SectionHeader';
import type { Merchant } from '../homeData';

// See the note in PopularStoresSection: RN already mirrors `row` under RTL, so
// `row-reverse` would flip it a second time.
const ROW = 'row' as const;
const CARD_W = 258;
const CARD_H = 176;

interface Props {
  merchants: Merchant[];
  title: string;
  subtitle?: string | null;
  onPressMerchant: (m: Merchant) => void;
  onPressSeeAll: () => void;
}

const SpotlightCard = memo(function SpotlightCard({
  m,
  onPress,
}: {
  m: Merchant;
  onPress: () => void;
}) {
  const isOpen = m.openness?.isOpenNow ?? m.isOpen;
  const cover = m.coverUrl || m.logoUrl || null;
  const rating = Number(m.rating ?? 0);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${m.storeNameAr}${isOpen ? '' : ' — مغلق'}`}
    >
      {cover ? (
        <Image
          source={{ uri: cover }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessible={false}
        />
      ) : (
        <View style={styles.fallback}>
          <ImageOff size={30} color="#C9BDB5" />
        </View>
      )}

      {/* Reading scrim. Without it the white type disappears over a bright
          dish photo, which is most of them. */}
      <LinearGradient
        colors={['rgba(20,10,7,0)', 'rgba(20,10,7,0.28)', 'rgba(20,10,7,0.86)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Positioned straight onto the card, not inside a zero-height wrapper —
          Android can clip children that overflow a parent with no measured
          height. */}
      <View style={styles.heart}>
        <HeartButton merchantId={m.id} merchantName={m.storeNameAr} size="sm" />
      </View>
      {!!m.hasOffers && (
        <View style={styles.offerBadge}>
          <Text style={styles.offerBadgeText}>عرض</Text>
        </View>
      )}

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {m.storeNameAr}
        </Text>

        <View style={[styles.metaRow, { flexDirection: ROW }]}>
          {/* Closed reads as a pill in the same row rather than a floating
              badge: it can never collide with the heart or the offer tag, and
              the card keeps one alignment grid. */}
          {!isOpen && (
            <View style={[styles.pill, styles.closedPill, { flexDirection: ROW }]}>
              <Text style={styles.pillText} numberOfLines={1}>
                {m.openness?.message || 'مغلق الآن'}
              </Text>
            </View>
          )}
          {rating > 0 && (
            <View style={[styles.pill, { flexDirection: ROW }]}>
              <Star size={11} color={colors.brand.gold} fill={colors.brand.gold} />
              <Text style={styles.pillText}>{rating.toFixed(1)}</Text>
            </View>
          )}
          {m.etaMinutes != null && (
            <View style={[styles.pill, { flexDirection: ROW }]}>
              <Clock size={11} color={colors.white} />
              <Text style={styles.pillText}>{m.etaMinutes} د</Text>
            </View>
          )}
          {m.deliveryFee != null && (
            <View style={[styles.pill, { flexDirection: ROW }]}>
              <Text style={styles.pillText}>توصيل {m.deliveryFee} ج.م</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
});

function SpotlightStoresSectionBase({
  merchants,
  title,
  subtitle,
  onPressMerchant,
  onPressSeeAll,
}: Props) {
  const renderItem = useCallback(
    ({ item }: { item: Merchant }) => (
      <SpotlightCard m={item} onPress={() => onPressMerchant(item)} />
    ),
    [onPressMerchant],
  );
  const keyExtractor = useCallback((m: Merchant) => m.id, []);

  // Nothing to show is not an error state here — it just means this city has no
  // restaurants yet, and an empty box at the very top of home looks broken.
  if (merchants.length === 0) return null;

  return (
    <View>
      <SectionHeader
        title={title}
        subtitle={subtitle ?? `${merchants.length} مطعم يوصّلك دلوقتي`}
        onPressSeeAll={onPressSeeAll}
      />
      <FlatList
        {...LIST_PERF}
        data={merchants}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListFooterComponent={
          <Pressable
            onPress={onPressSeeAll}
            style={({ pressed }) => [styles.moreCard, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="عرض كل المطاعم"
          >
            <View style={styles.moreIcon}>
              <UtensilsCrossed size={22} color={colors.brand.red} />
            </View>
            <Text style={styles.moreText}>كل المطاعم</Text>
          </Pressable>
        }
      />
    </View>
  );
}

export const SpotlightStoresSection = memo(SpotlightStoresSectionBase);

const styles = StyleSheet.create({
  listContent: { flexGrow: 1, gap: spacing.md, paddingVertical: 2 },

  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: '#F6F0EC',
    justifyContent: 'flex-end',
    ...shadows.md,
  },
  fallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },

  heart: {
    position: 'absolute',
    top: 8,
    ...(I18nManager.isRTL ? { left: 8 } : { right: 8 }),
  },
  offerBadge: {
    position: 'absolute',
    top: 10,
    ...(I18nManager.isRTL ? { right: 8 } : { left: 8 }),
    backgroundColor: colors.brand.red,
    borderRadius: radii.sm,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  offerBadgeText: {
    color: colors.white,
    fontSize: 10.5,
    fontFamily: fontFamilies.bodyExtraBold,
    includeFontPadding: false,
  },

  body: { padding: spacing.md, gap: 8 },
  name: {
    fontSize: 17,
    color: colors.white,
    fontFamily: fontFamilies.bodyExtraBold,
    textAlign: 'auto',
    writingDirection: 'rtl',
    includeFontPadding: false,
  },
  metaRow: { alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  pill: {
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: radii.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  pillText: {
    fontSize: 11.5,
    color: colors.white,
    fontFamily: fontFamilies.bodyBold,
    includeFontPadding: false,
  },

  closedPill: { backgroundColor: 'rgba(0,0,0,0.45)', maxWidth: '100%' },

  moreCard: {
    width: 116,
    height: CARD_H,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#EFE7E2',
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  moreIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: {
    fontSize: 13,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyExtraBold,
    includeFontPadding: false,
  },
});
