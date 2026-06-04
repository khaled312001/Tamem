import { StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';

import { colors, typography } from '../../theme/tokens';

/**
 * MoneyText — consistent EGP formatting. Arabic numerals, thousand separators,
 * smaller currency suffix. Use everywhere we render a price.
 *
 *   <MoneyText amount={1234.5} />            // ١٬٢٣٤٫٥ ج.م
 *   <MoneyText amount={50} size="lg" tone="brand" />
 *   <MoneyText amount={20} strikethrough />  // for "before" price
 *
 * Tone is decorative — pass `brand` for primary CTAs, `success` for savings,
 * `muted` for crossed-out original prices.
 */
export interface MoneyTextProps {
  amount: number | string;
  currency?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  tone?: 'ink' | 'brand' | 'success' | 'muted' | 'inverse';
  strikethrough?: boolean;
  showCurrency?: boolean;
  style?: TextStyle;
  containerStyle?: ViewStyle;
}

const FORMATTER = new Intl.NumberFormat('ar-EG', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function MoneyText({
  amount,
  currency = 'ج.م',
  size = 'md',
  tone = 'ink',
  strikethrough,
  showCurrency = true,
  style,
  containerStyle,
}: MoneyTextProps) {
  const num = typeof amount === 'string' ? Number(amount) : amount;
  const formatted = Number.isFinite(num) ? FORMATTER.format(num) : '—';
  const color = toneColor(tone);
  const numberStyle = SIZES[size];
  const decoration: TextStyle = strikethrough ? { textDecorationLine: 'line-through' } : {};

  return (
    <View style={[styles.row, containerStyle]}>
      <Text style={[numberStyle, { color }, decoration, style]} numberOfLines={1}>
        {formatted}
      </Text>
      {showCurrency && (
        <Text style={[styles.currency, { color, opacity: 0.7 }, decoration]} numberOfLines={1}>
          {currency}
        </Text>
      )}
    </View>
  );
}

function toneColor(tone: NonNullable<MoneyTextProps['tone']>): string {
  switch (tone) {
    case 'brand':
      return colors.brand.red;
    case 'success':
      return colors.success;
    case 'muted':
      return colors.text.muted;
    case 'inverse':
      return colors.white;
    case 'ink':
    default:
      return colors.ink;
  }
}

const SIZES: Record<NonNullable<MoneyTextProps['size']>, TextStyle> = {
  sm: typography.smallBold,
  md: typography.title,
  lg: typography.h3,
  xl: typography.h2,
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  currency: {
    fontSize: 11,
    fontFamily: typography.captionBold.fontFamily,
    includeFontPadding: false,
  },
});
