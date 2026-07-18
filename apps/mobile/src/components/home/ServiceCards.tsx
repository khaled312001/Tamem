import { ChevronLeft } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, radii, shadows, spacing } from '../../theme/tokens';

/**
 * The three headline service cards on Home — دليفري / شحن / تاجر — matching the
 * approved design: a tinted card per service, its bold brand-coloured title, a
 * one-line descriptor, the illustrated icon, and a coloured "go" chevron.
 *
 * Each service keeps its own accent so the row reads at a glance:
 *   delivery → red, shipping → orange, merchant → gold.
 */
export interface HomeService {
  key: 'delivery' | 'shipping' | 'merchant';
  title: string;
  subtitle: string;
  onPress: () => void;
}

const ACCENT: Record<HomeService['key'], { tint: string; color: string; icon: number }> = {
  delivery: {
    tint: '#FDECE7',
    color: colors.brand.red,
    icon: require('../../assets/home/icon-delivery.png'),
  },
  shipping: {
    tint: '#FDF1E3',
    color: colors.brand.orange,
    icon: require('../../assets/home/icon-shipping.png'),
  },
  merchant: {
    tint: '#FCF3DD',
    color: colors.brand.gold,
    icon: require('../../assets/home/icon-merchant.png'),
  },
};

export function ServiceCards({ services }: { services: HomeService[] }) {
  return (
    <View style={styles.row}>
      {services.map((s) => {
        const a = ACCENT[s.key];
        return (
          <Pressable
            key={s.key}
            onPress={s.onPress}
            style={({ pressed }) => [
              styles.card,
              { backgroundColor: a.tint },
              shadows.sm,
              pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
            ]}
            accessibilityRole="button"
            accessibilityLabel={s.title}
          >
            <Image source={a.icon} style={styles.icon} resizeMode="contain" />
            <Text style={[styles.title, { color: a.color }]} numberOfLines={1}>
              {s.title}
            </Text>
            <Text style={styles.subtitle} numberOfLines={2}>
              {s.subtitle}
            </Text>
            <View style={[styles.arrow, { backgroundColor: a.color }]}>
              <ChevronLeft size={14} color={colors.white} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  card: {
    flex: 1,
    borderRadius: radii.lg,
    padding: spacing.sm,
    paddingBottom: spacing.md,
    minHeight: 148,
    justifyContent: 'flex-start',
  },
  icon: {
    width: 60,
    height: 60,
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: fontFamilies.headingBold,
    fontSize: 15,
    textAlign: 'right',
  },
  subtitle: {
    fontFamily: fontFamilies.body,
    fontSize: 11,
    color: colors.text.muted,
    textAlign: 'right',
    marginTop: 2,
    lineHeight: 16,
  },
  arrow: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
