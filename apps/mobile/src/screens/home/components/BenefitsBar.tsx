/**
 * Four-up trust strip (عروض حصرية · طرق دفع آمنة · دعم 24/7 · توصيل سريع).
 *
 * Same copy the existing FeatureStrip shows, re-laid-out as one card with equal
 * columns and hairline dividers. Visibility is still driven by the server flag
 * (`homeConfig.showTrustStrip`) — the caller decides whether to mount it.
 */
import { BadgePercent, Headphones, Rocket, ShieldCheck } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, shadows, spacing } from '../../../theme/tokens';

// React Native already lays `flexDirection: 'row'` out right-to-left when
// I18nManager RTL is on. Adding 'row-reverse' on top of that flips it a
// SECOND time, back to left-to-right — which is why the header rendered
// mirrored. Plain 'row' is correct on native; the web build gets its
// direction from the document's dir="rtl".
const ROW = 'row' as const;

// Order matches the reference: exclusive offers on the right in RTL.
// Icons unified to the orange/gold logo family (per request).
const FEATURES = [
  {
    key: 'offers',
    Icon: BadgePercent,
    color: '#EC7A2C',
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
    color: '#E0781E',
    title: 'دعم 24/7',
    sub: 'نحن هنا دائماً',
  },
  { key: 'fast', Icon: Rocket, color: '#EC7A2C', title: 'توصيل سريع', sub: 'في أسرع وقت' },
] as const;

interface Props {
  /**
   * Optional headline from home-config (`trustStripTitle` / `trustStripSubtitle`).
   * The old home screen rendered these; when this layout replaced it they were
   * silently dropped, so editing them in صفحة التطبيق did nothing.
   */
  title?: string | null;
  subtitle?: string | null;
}

function BenefitsBarBase({ title, subtitle }: Props) {
  return (
    <View>
      {!!(title || subtitle) && (
        <View style={styles.headline}>
          {!!title && <Text style={styles.headlineTitle}>{title}</Text>}
          {!!subtitle && <Text style={styles.headlineSub}>{subtitle}</Text>}
        </View>
      )}

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
  headline: { marginBottom: spacing.sm },
  headlineTitle: {
    fontSize: 15,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyExtraBold,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  headlineSub: {
    fontSize: 12,
    color: colors.brand.gray,
    fontFamily: fontFamilies.body,
    textAlign: 'right',
    writingDirection: 'rtl',
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
