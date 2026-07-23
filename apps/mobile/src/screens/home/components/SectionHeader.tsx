/**
 * One branded section header for the whole home screen.
 *
 * Every rail used to style its own title/"عرض الكل" slightly differently, so
 * the page read as a stack of unrelated widgets. This gives them a single
 * identity: a red→gold accent bar (the brand gradient) before the title, one
 * type ramp, and a consistent "عرض الكل ‹" affordance.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, gradients, radii, spacing } from '../../../theme/tokens';

const ROW = 'row' as const;

interface Props {
  title: string;
  subtitle?: string | null;
  onPressSeeAll?: () => void;
  seeAllLabel?: string;
}

function SectionHeaderBase({ title, subtitle, onPressSeeAll, seeAllLabel = 'عرض الكل' }: Props) {
  return (
    <View style={[styles.wrap, { flexDirection: ROW }]}>
      <View style={[styles.titleRow, { flexDirection: ROW }]}>
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.accent}
        />
        <View style={styles.titleCol}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {!!subtitle && (
            <Text style={styles.sub} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>

      {!!onPressSeeAll && (
        <Pressable
          onPress={onPressSeeAll}
          hitSlop={8}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.seeAll,
            { flexDirection: ROW },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Text style={styles.seeAllText}>{seeAllLabel}</Text>
          <ChevronLeft size={15} color={colors.brand.red} />
        </Pressable>
      )}
    </View>
  );
}

export const SectionHeader = memo(SectionHeaderBase);

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  titleRow: { alignItems: 'center', gap: spacing.sm, flex: 1, minWidth: 0 },
  accent: {
    width: 5,
    height: 22,
    borderRadius: radii.pill,
  },
  titleCol: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 18,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyExtraBold,
    lineHeight: 27,
    includeFontPadding: false,
    textAlign: 'auto',
  },
  sub: {
    fontSize: 12,
    color: colors.brand.gray,
    fontFamily: fontFamilies.body,
    lineHeight: 18,
    includeFontPadding: false,
    textAlign: 'auto',
  },
  seeAll: {
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.brand.redLight,
    borderRadius: radii.pill,
    paddingStart: spacing.md,
    paddingEnd: spacing.sm,
    paddingVertical: 6,
  },
  seeAllText: {
    fontSize: 12.5,
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
    lineHeight: 18,
    includeFontPadding: false,
  },
});
