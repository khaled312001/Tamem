import type { LucideIcon } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors, palette, radii, shadows, spacing, typography } from '../../theme/tokens';

/**
 * OrderTimeline — vertical stepper for order status. Renders a beaded line
 * with one node per stage, animated progress dot pulsing on the current
 * stage. Talabat/Careem-style visual.
 *
 *   <OrderTimeline
 *      currentStage="DRIVER_ASSIGNED"
 *      stages={[
 *        { key: 'NEW', label: 'تم استلام طلبك', Icon: ClipboardCheck, completedAt: ... },
 *        { key: 'PRICED', label: 'تم تسعير الطلب', Icon: Tag, ... },
 *        { key: 'ACCEPTED', label: 'وافقت على السعر', Icon: CheckCircle, ... },
 *        { key: 'DRIVER_ASSIGNED', label: 'تعيين كابتن', Icon: User, ... },
 *        { key: 'PICKED_UP', label: 'الكابتن استلم طلبك', Icon: Package, ... },
 *        { key: 'IN_ROUTE', label: 'في الطريق إليك', Icon: Truck, ... },
 *        { key: 'DELIVERED', label: 'تم التوصيل', Icon: CheckCheck, ... },
 *      ]}
 *   />
 */
export interface TimelineStage {
  key: string;
  label: string;
  description?: string;
  Icon?: LucideIcon;
  completedAt?: string | null;
}

export interface OrderTimelineProps {
  stages: TimelineStage[];
  currentStage: string;
  /** "CANCELLED"/"REJECTED" — paints the active stage red. */
  failed?: boolean;
  style?: ViewStyle;
}

export function OrderTimeline({ stages, currentStage, failed, style }: OrderTimelineProps) {
  const currentIndex = Math.max(
    0,
    stages.findIndex((s) => s.key === currentStage),
  );

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });

  return (
    <View style={[styles.wrap, style]}>
      {stages.map((stage, i) => {
        const isCompleted = i < currentIndex;
        const isCurrent = i === currentIndex;
        const isUpcoming = i > currentIndex;
        const isLast = i === stages.length - 1;

        const nodeTint =
          isCurrent && failed
            ? { bg: palette.red_danger[500], fg: colors.white, ring: palette.red_danger[100] }
            : isCompleted
              ? { bg: palette.green[500], fg: colors.white, ring: palette.green[50] }
              : isCurrent
                ? { bg: palette.red[500], fg: colors.white, ring: palette.red[50] }
                : { bg: colors.white, fg: colors.text.muted, ring: colors.line2 };

        const Icon = stage.Icon;
        const titleColor = isUpcoming ? colors.text.muted : colors.ink;

        return (
          <View key={stage.key} style={styles.row}>
            {/* Left column — node + connecting line */}
            <View style={styles.gutter}>
              <View
                style={[
                  styles.node,
                  isCurrent && !failed && shadows.brand,
                  {
                    backgroundColor: nodeTint.bg,
                    borderColor: nodeTint.ring,
                  },
                ]}
              >
                {Icon ? (
                  <Icon size={14} color={nodeTint.fg} strokeWidth={2.5} />
                ) : (
                  <View style={[styles.dot, { backgroundColor: nodeTint.fg }]} />
                )}
                {isCurrent && !failed && (
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.pulse,
                      {
                        backgroundColor: palette.red[400],
                        transform: [{ scale: pulseScale }],
                        opacity: pulseOpacity,
                      },
                    ]}
                  />
                )}
              </View>
              {!isLast && (
                <View
                  style={[
                    styles.line,
                    { backgroundColor: i < currentIndex ? palette.green[300] : colors.line2 },
                  ]}
                />
              )}
            </View>

            {/* Right column — label + time + description */}
            <View style={styles.content}>
              <Text style={[typography.bodyBold, { color: titleColor }]} numberOfLines={1}>
                {stage.label}
              </Text>
              {stage.description && (
                <Text
                  style={[typography.caption, { color: colors.text.muted, marginTop: 2 }]}
                  numberOfLines={2}
                >
                  {stage.description}
                </Text>
              )}
              {stage.completedAt && (
                <Text
                  style={[
                    typography.caption,
                    { color: isCompleted ? palette.green[600] : colors.text.muted, marginTop: 4 },
                  ]}
                  numberOfLines={1}
                >
                  {formatTime(stage.completedAt)}
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

const NODE = 32;
const LINE_W = 2;

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md, minHeight: 60 },
  gutter: { alignItems: 'center', width: NODE },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: radii.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  pulse: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radii.pill,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  line: { width: LINE_W, flex: 1, minHeight: 20, marginVertical: 2 },
  content: { flex: 1, paddingTop: 4, paddingBottom: spacing.md },
});
