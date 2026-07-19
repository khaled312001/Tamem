/**
 * Full-width store card for the "المحلات اللي حواليك" list.
 *
 * Everything here comes from fields `/merchants` already returns and the home
 * screen was throwing away: the cover photo, the logo, the server-computed
 * openness message, the rating, and `distanceKm` (present once the list is
 * queried with lat/lng).
 *
 * A closed store is dimmed but still shown, with *when it opens* rather than a
 * bare "مغلق" — a closed store the customer can plan around is worth more than
 * a hidden one.
 */
import { Clock, ImageOff, Package, Star } from 'lucide-react-native';
import { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { HeartButton } from '../../../components/HeartButton';
import { colors, fontFamilies, radii, shadows, spacing } from '../../../theme/tokens';
import type { Merchant } from '../homeData';

const ROW = 'row' as const;
const COVER_H = 150;
const LOGO = 62;

function StoreCardBase({ merchant: m, onPress }: { merchant: Merchant; onPress: () => void }) {
  const isOpen = m.openness?.isOpenNow ?? m.isOpen;
  const cover = m.coverUrl || null;
  const rating = Number(m.rating ?? 0);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={m.storeNameAr}
    >
      <View style={styles.coverWrap}>
        {cover ? (
          <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={styles.coverFallback}>
            <ImageOff size={30} color="#C9BDB5" />
          </View>
        )}

        {/* Dim the photo, not the whole card — the name and meta below stay
            fully legible while the closed state is obvious at a glance. */}
        {!isOpen && <View style={styles.closedVeil} />}

        {!isOpen && (
          <View style={styles.closedPill}>
            <Clock size={12} color={colors.white} />
            <Text style={styles.closedPillText} numberOfLines={1}>
              {m.openness?.message ?? 'مغلق حالياً'}
            </Text>
          </View>
        )}

        {!!m.isNew && (
          <View style={styles.newPill}>
            <Text style={styles.newPillText}>جديد</Text>
          </View>
        )}

        {m.distanceKm != null && (
          <View style={styles.distancePill}>
            <Text style={styles.distanceText}>{formatKm(m.distanceKm)}</Text>
          </View>
        )}

        <View style={styles.heart}>
          <HeartButton merchantId={m.id} merchantName={m.storeNameAr} size="sm" />
        </View>

        {!!m.logoUrl && (
          <View style={styles.logoWrap}>
            <Image source={{ uri: m.logoUrl }} style={styles.logo} resizeMode="cover" />
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {m.storeNameAr}
        </Text>

        <View style={[styles.metaRow, { flexDirection: ROW }]}>
          <Text style={styles.category} numberOfLines={1}>
            {m.category?.nameAr ?? '—'}
          </Text>

          {rating > 0 && (
            <View style={[styles.meta, { flexDirection: ROW }]}>
              <Star size={12} color={colors.brand.gold} fill={colors.brand.gold} />
              <Text style={styles.metaText}>{rating.toFixed(1)}</Text>
            </View>
          )}

          {m.etaMinutes != null && (
            <View style={[styles.meta, { flexDirection: ROW }]}>
              <Clock size={12} color={colors.brand.gray} />
              <Text style={styles.metaText}>{m.etaMinutes} د</Text>
            </View>
          )}

          {/* Only when there is a real catalogue — "0 صنف" reads as broken,
              and plenty of stores here work purely on free-text orders. */}
          {!!m.productCount && m.productCount > 0 && (
            <View style={[styles.meta, { flexDirection: ROW }]}>
              <Package size={12} color={colors.brand.gray} />
              <Text style={styles.metaText}>{m.productCount} صنف</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

/** Under a kilometre reads better in metres than as "0.1 كم". */
function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} م` : `${km.toFixed(2)} كم`;
}

export const StoreCard = memo(StoreCardBase);

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#EFE7E2',
    overflow: 'hidden',
    ...shadows.sm,
  },
  coverWrap: { height: COVER_H, backgroundColor: '#F6F0EC' },
  coverFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  closedVeil: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(36,19,16,0.45)' },

  closedPill: {
    position: 'absolute',
    top: spacing.sm,
    insetInlineStart: spacing.sm,
    maxWidth: '75%',
    flexDirection: ROW,
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(224,48,30,0.92)',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  closedPillText: {
    color: colors.white,
    fontSize: 11,
    fontFamily: fontFamilies.bodyBold,
    flexShrink: 1,
  },

  distancePill: {
    position: 'absolute',
    bottom: spacing.sm,
    insetInlineStart: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: radii.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  distanceText: {
    color: colors.white,
    fontSize: 11,
    fontFamily: fontFamilies.bodyExtraBold,
  },

  heart: { position: 'absolute', top: spacing.sm, insetInlineEnd: spacing.sm },

  newPill: {
    position: 'absolute',
    bottom: spacing.sm,
    insetInlineEnd: spacing.sm,
    backgroundColor: '#20A85B',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  newPillText: { color: colors.white, fontSize: 11, fontFamily: fontFamilies.bodyExtraBold },

  logoWrap: {
    position: 'absolute',
    bottom: -LOGO / 2,
    alignSelf: 'center',
    width: LOGO,
    height: LOGO,
    borderRadius: LOGO / 2,
    borderWidth: 3,
    borderColor: colors.white,
    backgroundColor: colors.white,
    overflow: 'hidden',
    ...shadows.sm,
  },
  logo: { width: '100%', height: '100%' },

  // Leaves room for the logo that overhangs the cover.
  body: { paddingTop: LOGO / 2 + 6, paddingBottom: spacing.md, paddingHorizontal: spacing.md },
  name: {
    fontSize: 15,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyExtraBold,
    textAlign: 'center',
  },
  metaRow: {
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  meta: { alignItems: 'center', gap: 3 },
  metaText: { fontSize: 12, color: colors.brand.gray, fontFamily: fontFamilies.bodyBold },
  category: { fontSize: 12, color: colors.brand.gray, fontFamily: fontFamilies.body },
  pressed: { opacity: 0.9 },
});
