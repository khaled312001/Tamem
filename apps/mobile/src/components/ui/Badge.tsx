import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors, palette, radii, spacing, typography } from '../../theme/tokens';

/**
 * Badge — small label with semantic tone. Use for status pills, counters,
 * "new" tags, dietary markers, etc.
 *
 *   <Badge tone="success">جاهز</Badge>
 *   <Badge tone="warning" Icon={Clock}>قيد التحضير</Badge>
 */
export type BadgeTone =
  | 'neutral'
  | 'brand'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'gold'
  | 'inverse';

export interface BadgeProps {
  children: string | number;
  tone?: BadgeTone;
  Icon?: LucideIcon;
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

export function Badge({ children, tone = 'neutral', Icon, size = 'md', style }: BadgeProps) {
  const { bg, fg } = toneColors(tone);
  const iconSize = size === 'sm' ? 10 : 12;

  return (
    <View
      style={[styles.base, size === 'sm' ? styles.sm : styles.md, { backgroundColor: bg }, style]}
    >
      {Icon && <Icon size={iconSize} color={fg} />}
      <Text
        style={[size === 'sm' ? typography.overline : typography.captionBold, { color: fg }]}
        numberOfLines={1}
      >
        {String(children)}
      </Text>
    </View>
  );
}

function toneColors(tone: BadgeTone): { bg: string; fg: string } {
  switch (tone) {
    case 'brand':
      return { bg: palette.red[50], fg: palette.red[700] };
    case 'success':
      return { bg: palette.green[50], fg: palette.green[700] };
    case 'warning':
      return { bg: palette.gold[50], fg: palette.gold[700] };
    case 'danger':
      return { bg: palette.red_danger[50], fg: palette.red_danger[700] };
    case 'info':
      return { bg: palette.blue[50], fg: palette.blue[700] };
    case 'gold':
      return { bg: palette.gold[100], fg: palette.gold[800] };
    case 'inverse':
      return { bg: colors.brand.dark, fg: colors.white };
    case 'neutral':
    default:
      return { bg: colors.soft, fg: colors.text.secondary };
  }
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  sm: { paddingHorizontal: spacing.sm, paddingVertical: 2 },
  md: { paddingHorizontal: spacing.md, paddingVertical: 4 },
});
