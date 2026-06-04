import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors, palette, radii, spacing, typography } from '../../theme/tokens';

/**
 * Stat — labeled number for "X طلب", "Y ج.م", etc. Goes inside a Card
 * row. Optionally colored to match status (rewards → gold, due → danger).
 */
export interface StatProps {
  label: string;
  value: string | number;
  Icon?: LucideIcon;
  tone?: 'neutral' | 'brand' | 'gold' | 'success' | 'danger';
  align?: 'start' | 'center' | 'end';
  style?: ViewStyle;
}

export function Stat({ label, value, Icon, tone = 'neutral', align = 'start', style }: StatProps) {
  const tint = toneTint(tone);
  return (
    <View style={[styles.wrap, { alignItems: alignItems(align) }, style]}>
      {Icon && (
        <View style={[styles.iconWrap, { backgroundColor: tint.bg }]}>
          <Icon size={16} color={tint.fg} />
        </View>
      )}
      <Text style={[typography.h2, { color: tint.fg }]} numberOfLines={1}>
        {String(value)}
      </Text>
      <Text style={[typography.caption, { color: colors.text.muted }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function toneTint(tone: NonNullable<StatProps['tone']>): { bg: string; fg: string } {
  switch (tone) {
    case 'brand':
      return { bg: palette.red[50], fg: palette.red[600] };
    case 'gold':
      return { bg: palette.gold[50], fg: palette.gold[700] };
    case 'success':
      return { bg: palette.green[50], fg: palette.green[600] };
    case 'danger':
      return { bg: palette.red_danger[50], fg: palette.red_danger[600] };
    case 'neutral':
    default:
      return { bg: colors.soft, fg: colors.ink };
  }
}

function alignItems(a: 'start' | 'center' | 'end'): ViewStyle['alignItems'] {
  return a === 'center' ? 'center' : a === 'end' ? 'flex-end' : 'flex-start';
}

const styles = StyleSheet.create({
  wrap: { gap: 4, flex: 1 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
});
