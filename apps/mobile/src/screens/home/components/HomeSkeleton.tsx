/**
 * First-paint placeholder. Mirrors the real layout (header → search → banner →
 * services → benefits) so the page doesn't jump when data lands, instead of a
 * single spinner in the middle of an empty screen.
 */
import { memo } from 'react';
import { I18nManager, StyleSheet, View, useWindowDimensions } from 'react-native';

import { radii, spacing } from '../../../theme/tokens';

const ROW = I18nManager.isRTL ? 'row-reverse' : ('row' as const);
const BONE = '#F1EAE5';

function Bone({
  h,
  w,
  r = radii.sm,
  style,
}: {
  h: number;
  w?: number | string;
  r?: number;
  style?: object;
}) {
  return (
    <View
      style={[{ height: h, width: w ?? '100%', borderRadius: r, backgroundColor: BONE }, style]}
    />
  );
}

function HomeSkeletonBase() {
  const { width } = useWindowDimensions();
  const bannerW = width - spacing.lg * 2;

  return (
    <View style={styles.wrap} accessibilityLabel="جاري التحميل">
      <View style={[styles.row, { flexDirection: ROW }]}>
        <View style={[styles.row, { flexDirection: ROW, gap: spacing.sm }]}>
          <Bone h={46} w={46} r={23} />
          <Bone h={14} w={110} />
        </View>
        <Bone h={46} w={46} r={radii.md} />
      </View>

      <Bone h={28} w={180} style={{ marginTop: spacing.lg }} />
      <Bone h={14} w={140} style={{ marginTop: spacing.sm }} />

      <Bone h={60} r={18} style={{ marginTop: spacing.lg }} />
      <Bone h={bannerW / (1600 / 600)} r={radii.xl} style={{ marginTop: spacing.xl }} />

      <View style={[styles.row, { flexDirection: ROW, gap: spacing.md, marginTop: spacing.xl }]}>
        <Bone h={158} w="32%" r={18} />
        <Bone h={158} w="32%" r={18} />
        <Bone h={158} w="32%" r={18} />
      </View>

      <Bone h={100} r={18} style={{ marginTop: spacing.xl }} />
    </View>
  );
}

export const HomeSkeleton = memo(HomeSkeletonBase);

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  row: { alignItems: 'center', justifyContent: 'space-between' },
});
