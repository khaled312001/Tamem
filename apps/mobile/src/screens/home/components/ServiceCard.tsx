/**
 * One of the three headline service cards (دليفري / شحن / تاجر).
 *
 * Equal width is enforced by the parent's `flex: 1` row, so the three cards
 * always match regardless of copy length or screen size.
 */
import type { LucideIcon } from 'lucide-react-native';
import { memo } from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';

import { ForwardChevron } from '../../../components/ui';
import { colors, fontFamilies, shadows, spacing } from '../../../theme/tokens';

interface Props {
  title: string;
  subtitle: string;
  Icon: LucideIcon;
  /** Card tint. */
  bg: string;
  /** Icon + title colour. */
  fg: string;
  onPress: () => void;
}

function ServiceCardBase({ title, subtitle, Icon, bg, fg, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: bg }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${title} — ${subtitle}`}
    >
      <View style={styles.iconWrap}>
        <Icon size={44} color={fg} strokeWidth={1.6} />
      </View>

      <Text style={[styles.title, { color: fg }]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.subtitle} numberOfLines={1}>
        {subtitle}
      </Text>

      <View style={[styles.arrow, { backgroundColor: fg }]}>
        <ForwardChevron size={14} color={colors.white} />
      </View>
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
  iconWrap: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
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
  arrow: {
    position: 'absolute',
    bottom: spacing.md,
    ...(I18nManager.isRTL ? { left: spacing.md } : { right: spacing.md }),
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85 },
});
