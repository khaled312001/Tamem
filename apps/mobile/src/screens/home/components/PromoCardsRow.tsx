/**
 * The two side-by-side call-to-action cards under the store rail:
 * "تتبع طلبك" and "توصيل سريع".
 *
 * Both are pure navigation shortcuts into flows that already exist — tracking
 * routes to the active order when there is one, otherwise to the orders list.
 */
import { MapPin, Navigation } from 'lucide-react-native';
import { memo } from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, radii, spacing } from '../../../theme/tokens';

// React Native already lays `flexDirection: 'row'` out right-to-left when
// I18nManager RTL is on. Adding 'row-reverse' on top of that flips it a
// SECOND time, back to left-to-right — which is why the header rendered
// mirrored. Plain 'row' is correct on native; the web build gets its
// direction from the document's dir="rtl".
const ROW = 'row' as const;

interface CardProps {
  title: string;
  subtitle: string;
  cta: string;
  /** Card tint. */
  bg: string;
  /** Button + icon colour. */
  fg: string;
  Icon: typeof MapPin;
  onPress: () => void;
}

const PromoCard = memo(function PromoCard({
  title,
  subtitle,
  cta,
  bg,
  fg,
  Icon,
  onPress,
}: CardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: bg }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${title} — ${cta}`}
    >
      {/* Watermark icon, mirroring the illustration in the design. */}
      <View style={styles.art}>
        <Icon size={54} color={fg} strokeWidth={1.4} opacity={0.18} />
      </View>

      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.subtitle} numberOfLines={2}>
        {subtitle}
      </Text>

      <View style={[styles.cta, { backgroundColor: fg }]}>
        <Text style={styles.ctaText}>{cta}</Text>
      </View>
    </Pressable>
  );
});

interface Props {
  onPressTrack: () => void;
  onPressFastDelivery: () => void;
}

function PromoCardsRowBase({ onPressTrack, onPressFastDelivery }: Props) {
  return (
    <View style={[styles.row, { flexDirection: ROW }]}>
      <PromoCard
        title="تتبع طلبك"
        subtitle="اعرف حالة طلبك لحظة بلحظة"
        cta="تتبع الآن"
        bg="#FFF4E8"
        fg="#EC7A2C"
        Icon={Navigation}
        onPress={onPressTrack}
      />
      <PromoCard
        title="توصيل سريع"
        subtitle="من أقرب مندوب إليك"
        cta="اطلب الآن"
        bg="#FFF1F0"
        fg={colors.brand.red}
        Icon={MapPin}
        onPress={onPressFastDelivery}
      />
    </View>
  );
}

export const PromoCardsRow = memo(PromoCardsRowBase);

const styles = StyleSheet.create({
  row: { gap: spacing.md },
  card: {
    flex: 1,
    minHeight: 140,
    borderRadius: radii.lg,
    padding: spacing.md,
    overflow: 'hidden',
    justifyContent: 'flex-start',
  },
  art: {
    position: 'absolute',
    bottom: -6,
    ...(I18nManager.isRTL ? { left: -6 } : { right: -6 }),
  },
  title: {
    fontSize: 16,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyExtraBold,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    color: colors.brand.gray,
    fontFamily: fontFamilies.body,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  cta: {
    marginTop: spacing.md,
    alignSelf: I18nManager.isRTL ? 'flex-end' : 'flex-start',
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  ctaText: {
    color: colors.white,
    fontSize: 12,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  pressed: { opacity: 0.85 },
});
