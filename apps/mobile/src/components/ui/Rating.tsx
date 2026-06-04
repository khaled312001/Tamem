import { Star } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors, hitSlop, palette, typography } from '../../theme/tokens';

/**
 * Rating — star display + optional interactive picker. Two modes:
 *
 *   <Rating value={4.5} size="sm" />                 // read-only display
 *   <Rating value={3} onChange={setValue} />          // interactive picker
 *   <Rating value={4.7} reviewCount={328} size="md" /> // with count caption
 *
 * Always renders 5 stars; uses half-star fills via overlay.
 */
export interface RatingProps {
  value: number;
  onChange?: (v: number) => void;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  reviewCount?: number | null;
  style?: ViewStyle;
}

const STAR_SIZES = { xs: 12, sm: 14, md: 18, lg: 24 };

export function Rating({ value, onChange, size = 'sm', reviewCount, style }: RatingProps) {
  const dim = STAR_SIZES[size];
  const interactive = !!onChange;

  return (
    <View style={[styles.row, style]}>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = value >= n - 0.25;
          const halfFilled = !filled && value >= n - 0.75;
          const star = (
            <View key={n} style={{ width: dim, height: dim }}>
              <Star
                size={dim}
                color={palette.gold[500]}
                fill={filled || halfFilled ? palette.gold[400] : 'transparent'}
                strokeWidth={1.5}
              />
              {halfFilled && (
                <View style={[styles.halfMask, { width: dim / 2, height: dim }]}>
                  <Star size={dim} color={palette.gold[500]} fill="transparent" strokeWidth={1.5} />
                </View>
              )}
            </View>
          );
          if (!interactive) return star;
          return (
            <Pressable
              key={n}
              onPress={() => onChange?.(n)}
              hitSlop={hitSlop.sm}
              accessibilityRole="button"
              accessibilityLabel={`${n} نجوم`}
            >
              {star}
            </Pressable>
          );
        })}
      </View>
      {!interactive && Number.isFinite(value) && (
        <Text style={[typography.captionBold, { color: colors.ink }]}>{value.toFixed(1)}</Text>
      )}
      {!interactive && typeof reviewCount === 'number' && (
        <Text style={[typography.caption, { color: colors.text.muted }]}>
          ({reviewCount.toLocaleString('ar-EG')})
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stars: { flexDirection: 'row', gap: 2 },
  halfMask: {
    position: 'absolute',
    top: 0,
    right: 0,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
});
