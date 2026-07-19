/**
 * One of the three headline service cards (دليفري / شحن / تاجر).
 *
 * Equal width is enforced by the parent's `flex: 1` row, so the three cards
 * always match regardless of copy length or screen size.
 */
import type { LucideIcon } from 'lucide-react-native';
import { memo } from 'react';
import { I18nManager, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, shadows, spacing } from '../../../theme/tokens';

interface Props {
  title: string;
  subtitle: string;
  Icon: LucideIcon;
  /** Illustration for this service. Falls back to `Icon` when absent. */
  image?: number;
  /** Card tint. */
  bg: string;
  /** Icon + title colour. */
  fg: string;
  onPress: () => void;
}

function ServiceCardBase({ title, subtitle, Icon, image, bg, fg, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: bg }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${title} — ${subtitle}`}
    >
      {/* Stand-in for the illustration in the design: a tinted disc behind an
          oversized icon. Swap in the real artwork when the assets land. */}
      {image ? (
        <Image source={image} style={styles.art} resizeMode="contain" />
      ) : (
        <View style={[styles.iconWrap, { backgroundColor: `${fg}1F` }]}>
          <Icon size={38} color={fg} strokeWidth={1.7} />
        </View>
      )}

      <Text style={[styles.title, { color: fg }]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.subtitle} numberOfLines={1}>
        {subtitle}
      </Text>
    </Pressable>
  );
}

export const ServiceCard = memo(ServiceCardBase);

const styles = StyleSheet.create({
  card: {
    flex: 1,
    height: 158,
    borderRadius: 18,
    padding: spacing.md,
    alignItems: I18nManager.isRTL ? 'flex-end' : 'flex-start',
    justifyContent: 'flex-start',
    ...shadows.sm,
  },
  art: {
    width: 88,
    height: 72,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 20,
    fontFamily: fontFamilies.bodyExtraBold,
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  subtitle: {
    marginTop: 1,
    fontSize: 13,
    color: colors.brand.gray,
    fontFamily: fontFamilies.body,
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  pressed: { opacity: 0.85 },
});
