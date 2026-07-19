/**
 * The floating info card that overlaps the store's cover photo.
 *
 * Every stat here is real. The reference design also shows delivery time,
 * delivery fee and a minimum order — this app has none of those per-merchant
 * (the delivery fee is a property of the customer's ADDRESS ZONE, not the
 * store), so rather than invent numbers the row renders only the stats that
 * exist and stays balanced whether that's two or four.
 */
import { MapPin, Package, Phone, Star } from 'lucide-react-native';
import { memo } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, radii, shadows, spacing } from '../../theme/tokens';

const ROW = 'row' as const;
const LOGO = 84;

export interface MerchantHeaderData {
  storeNameAr: string;
  logoUrl?: string | null;
  addressLine?: string;
  phone?: string | null;
  rating?: number | string | null;
  categoryName?: string | null;
  productCount?: number;
  distanceKm?: number;
  isOpenNow: boolean;
  /** Server copy, e.g. "يفتح غداً الساعة 10:00 ص". */
  opennessMessage?: string | null;
}

interface Props {
  data: MerchantHeaderData;
  onPressMap?: () => void;
}

function MerchantHeaderCardBase({ data: d, onPressMap }: Props) {
  const rating = Number(d.rating ?? 0);

  const stats: { key: string; Icon: typeof Star; value: string; label: string }[] = [];
  if (rating > 0) {
    stats.push({ key: 'rating', Icon: Star, value: rating.toFixed(1), label: 'التقييم' });
  }
  if (d.productCount != null && d.productCount > 0) {
    stats.push({
      key: 'items',
      Icon: Package,
      value: String(d.productCount),
      label: 'صنف متاح',
    });
  }
  if (d.distanceKm != null) {
    stats.push({
      key: 'distance',
      Icon: MapPin,
      value:
        d.distanceKm < 1 ? `${Math.round(d.distanceKm * 1000)} م` : `${d.distanceKm.toFixed(1)} كم`,
      label: 'المسافة',
    });
  }
  if (d.phone) {
    stats.push({ key: 'phone', Icon: Phone, value: 'اتصل', label: 'بالمتجر' });
  }

  return (
    <View style={[styles.card, shadows.md]}>
      <View style={[styles.titleRow, { flexDirection: ROW }]}>
        {!!d.logoUrl && (
          <View style={styles.logoWrap}>
            <Image source={{ uri: d.logoUrl }} style={styles.logo} resizeMode="cover" />
          </View>
        )}

        <View style={styles.titleCol}>
          <Text style={styles.name} numberOfLines={2}>
            {d.storeNameAr}
          </Text>
          {!!d.categoryName && (
            <Text style={styles.category} numberOfLines={1}>
              {d.categoryName}
            </Text>
          )}
        </View>

        <View style={[styles.statusPill, d.isOpenNow ? styles.openPill : styles.closedPill]}>
          <View style={[styles.dot, d.isOpenNow ? styles.dotOpen : styles.dotClosed]} />
          <Text style={[styles.statusText, d.isOpenNow ? styles.openText : styles.closedText]}>
            {d.isOpenNow ? 'مفتوح الآن' : 'مغلق الآن'}
          </Text>
        </View>
      </View>

      {/* When closed, say WHEN it opens rather than just that it's shut. */}
      {!d.isOpenNow && !!d.opennessMessage && (
        <Text style={styles.nextOpen} numberOfLines={1}>
          {d.opennessMessage}
        </Text>
      )}

      {stats.length > 0 && (
        <View style={[styles.stats, { flexDirection: ROW }]}>
          {stats.map((s, i) => (
            <Pressable
              key={s.key}
              disabled={s.key !== 'phone'}
              onPress={
                s.key === 'phone' && d.phone
                  ? () => void Linking.openURL(`tel:${d.phone}`)
                  : undefined
              }
              style={[styles.stat, i > 0 && styles.statDivider]}
            >
              <s.Icon
                size={18}
                color={s.key === 'rating' ? colors.brand.gold : colors.brand.red}
                fill={s.key === 'rating' ? colors.brand.gold : 'transparent'}
              />
              <Text style={styles.statValue} numberOfLines={1}>
                {s.value}
              </Text>
              <Text style={styles.statLabel} numberOfLines={1}>
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {!!d.addressLine && (
        <View style={[styles.addressRow, { flexDirection: ROW }]}>
          <MapPin size={15} color={colors.brand.red} />
          <Text style={styles.address} numberOfLines={2}>
            {d.addressLine}
          </Text>
          {!!onPressMap && (
            <Pressable
              onPress={onPressMap}
              style={({ pressed }) => [styles.mapBtn, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
            >
              <Text style={styles.mapBtnText}>على الخريطة</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

export const MerchantHeaderCard = memo(MerchantHeaderCardBase);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    marginHorizontal: spacing.lg,
    // Pulls the card up over the cover photo.
    marginTop: -60,
    padding: spacing.md,
    paddingTop: spacing.lg,
  },
  // A real flex child, not absolutely positioned: overlap was unavoidable while
  // the name had to reserve a guessed amount of padding for it. marginTop still
  // lifts it over the cover photo, but it now occupies real width.
  logoWrap: {
    marginTop: -(LOGO / 2 + spacing.md),
    width: LOGO,
    height: LOGO,
    borderRadius: LOGO / 2,
    borderWidth: 4,
    borderColor: colors.white,
    backgroundColor: colors.white,
    overflow: 'hidden',
    ...shadows.sm,
  },
  logo: { width: '100%', height: '100%' },

  titleRow: { alignItems: 'flex-start', gap: spacing.sm },
  titleCol: { flex: 1 },
  name: {
    fontSize: 20,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyExtraBold,
    textAlign: 'auto',
  },
  category: {
    marginTop: 2,
    fontSize: 13,
    color: colors.brand.gray,
    fontFamily: fontFamilies.body,
    textAlign: 'auto',
  },

  statusPill: {
    flexDirection: ROW,
    alignItems: 'center',
    gap: 5,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  openPill: { backgroundColor: '#E9F8EF' },
  closedPill: { backgroundColor: '#FDECEA' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotOpen: { backgroundColor: '#20A85B' },
  dotClosed: { backgroundColor: colors.brand.red },
  statusText: { fontSize: 12, fontFamily: fontFamilies.bodyExtraBold },
  openText: { color: '#20A85B' },
  closedText: { color: colors.brand.red },

  nextOpen: {
    marginTop: 6,
    fontSize: 12,
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyBold,
    textAlign: 'auto',
  },

  stats: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EFE7E2',
  },
  stat: { flex: 1, alignItems: 'center', gap: 3 },
  statDivider: {
    borderStartWidth: StyleSheet.hairlineWidth,
    borderStartColor: '#EFE7E2',
  },
  statValue: {
    fontSize: 15,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  statLabel: { fontSize: 11, color: colors.brand.gray, fontFamily: fontFamilies.body },

  addressRow: {
    marginTop: spacing.md,
    alignItems: 'center',
    gap: 6,
  },
  address: {
    flex: 1,
    fontSize: 12,
    color: colors.brand.gray,
    fontFamily: fontFamilies.body,
    textAlign: 'auto',
  },
  mapBtn: {
    borderWidth: 1,
    borderColor: colors.brand.red,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  mapBtnText: { fontSize: 12, color: colors.brand.red, fontFamily: fontFamilies.bodyExtraBold },
});
