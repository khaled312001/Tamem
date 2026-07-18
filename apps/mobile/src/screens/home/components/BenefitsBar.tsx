/**
 * Four-up trust strip (عروض حصرية · طرق دفع آمنة · دعم 24/7 · توصيل سريع).
 *
 * Same copy the existing FeatureStrip shows, re-laid-out as one card with equal
 * columns and hairline dividers. Visibility is still driven by the server flag
 * (`homeConfig.showTrustStrip`) — the caller decides whether to mount it.
 */
import { BadgePercent, Headphones, Rocket, ShieldCheck } from 'lucide-react-native';
import { memo } from 'react';
import { I18nManager, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, shadows, spacing } from '../../../theme/tokens';

const ROW = I18nManager.isRTL ? 'row-reverse' : ('row' as const);

// Order matches the reference: exclusive offers on the right in RTL.
const FEATURES = [
  {
    key: 'offers',
    Icon: BadgePercent,
    color: colors.brand.red,
    title: 'عروض حصرية',
    sub: 'خصومات مميزة',
  },
  {
    key: 'pay',
    Icon: ShieldCheck,
    color: colors.brand.gold,
    title: 'طرق دفع آمنة',
    sub: 'حماية كاملة',
  },
  {
    key: 'support',
    Icon: Headphones,
    color: colors.brand.gold,
    title: 'دعم 24/7',
    sub: 'نحن هنا دائماً',
  },
  { key: 'fast', Icon: Rocket, color: colors.brand.red, title: 'توصيل سريع', sub: 'في أسرع وقت' },
] as const;

function BenefitsBarBase() {
  return (
    <View style={[styles.card, { flexDirection: ROW }]}>
      {FEATURES.map((f, i) => (
        <View key={f.key} style={[styles.item, i > 0 && styles.divider]}>
          <f.Icon size={26} color={f.color} strokeWidth={2} />
          <Text style={styles.title} numberOfLines={1}>
            {f.title}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {f.sub}
          </Text>
        </View>
      ))}
    </View>
  );
}

export const BenefitsBar = memo(BenefitsBarBase);

const styles = StyleSheet.create({
  card: {
    minHeight: 100,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#EFE7E2',
    paddingVertical: spacing.md,
    ...shadows.sm,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 4,
  },
  // Hairline between columns; sits on the leading edge of every item but the
  // first, so it reads the same in RTL and LTR.
  divider: {
    borderStartWidth: StyleSheet.hairlineWidth,
    borderStartColor: '#EFE7E2',
  },
  title: {
    fontSize: 13,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyBold,
    textAlign: 'center',
  },
  sub: {
    fontSize: 11,
    color: colors.brand.gray,
    fontFamily: fontFamilies.body,
    textAlign: 'center',
  },
});
