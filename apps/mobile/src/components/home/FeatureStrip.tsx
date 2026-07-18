import { BadgePercent, Headphones, Rocket, ShieldCheck } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, radii, shadows, spacing } from '../../theme/tokens';

/**
 * Trust/feature strip under the service cards — four reassurances that answer
 * "why order here" at a glance. Static copy by design; these are brand promises,
 * not admin-configurable content.
 */
const FEATURES = [
  { Icon: Rocket, color: colors.brand.red, title: 'توصيل سريع', sub: 'في أسرع وقت' },
  { Icon: Headphones, color: colors.brand.gold, title: 'دعم 24/7', sub: 'نحن هنا دائماً' },
  { Icon: ShieldCheck, color: colors.brand.gold, title: 'طرق دفع آمنة', sub: 'حماية كاملة' },
  { Icon: BadgePercent, color: colors.brand.red, title: 'عروض حصرية', sub: 'خصومات مميزة' },
] as const;

export function FeatureStrip() {
  return (
    <View style={[styles.card, shadows.sm]}>
      {FEATURES.map((f, i) => (
        <View key={f.title} style={styles.item}>
          {i > 0 && <View style={styles.divider} />}
          <f.Icon size={20} color={f.color} />
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

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row-reverse',
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    marginHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  divider: {
    position: 'absolute',
    right: 0,
    top: '15%',
    height: '70%',
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  title: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 11,
    color: colors.text.primary,
    textAlign: 'center',
  },
  sub: {
    fontFamily: fontFamilies.body,
    fontSize: 9,
    color: colors.text.muted,
    textAlign: 'center',
  },
});
