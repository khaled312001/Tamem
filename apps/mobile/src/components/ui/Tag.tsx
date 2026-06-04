import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors, palette, radii, typography } from '../../theme/tokens';

/**
 * Tag — flat inline label without a background pill. Sits next to text.
 * Less visual weight than Badge; use for dietary markers, hours,
 * inline notices ("جديد", "حلال", "مفتوح حتى ١٢ص").
 *
 *   <Tag Icon={Clock} label="٢٥-٣٥ دقيقة" />
 *   <Tag label="حلال" tone="success" />
 */
export interface TagProps {
  label: string;
  Icon?: LucideIcon;
  tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'info';
  bold?: boolean;
  style?: ViewStyle;
}

export function Tag({ label, Icon, tone = 'neutral', bold = true, style }: TagProps) {
  const fg = toneFg(tone);
  return (
    <View style={[styles.row, style]}>
      {Icon && <Icon size={12} color={fg} strokeWidth={2} />}
      <Text
        style={[bold ? typography.captionBold : typography.caption, { color: fg }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

function toneFg(tone: NonNullable<TagProps['tone']>): string {
  switch (tone) {
    case 'brand':
      return palette.red[600];
    case 'success':
      return palette.green[600];
    case 'warning':
      return palette.gold[700];
    case 'info':
      return palette.blue[600];
    case 'neutral':
    default:
      return colors.text.secondary;
  }
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});

// Re-export for convenience when consumers need to construct radii-sized tags.
export const __TAG_RADII = radii;
