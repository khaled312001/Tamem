/**
 * قرص اختيار الوقت — a clock face instead of a wall of chips.
 *
 * The schedule sheet listed 25 half-hour chips; scanning them to find one hour
 * is more work than pointing at a clock. This shows the hours on a dial and the
 * quarters as a short row underneath.
 *
 * It keeps the one thing the chip grid got right and a plain dial would lose:
 * an hour that has already passed (or is too soon) is drawn dim and refuses the
 * tap, so the picker can't be used to choose a slot the kitchen cannot make.
 */
import { memo, useCallback, useRef } from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';

import { colors, fontFamilies, radii, spacing } from '../theme/tokens';

const SIZE = 208;
const R = SIZE / 2;
const RING = R - 30;
const HOURS = Array.from({ length: 12 }, (_, i) => (i === 0 ? 12 : i));
const QUARTERS = [0, 15, 30, 45];

export interface DialTime {
  h: number;
  m: number;
}

interface Props {
  value: DialTime;
  onChange: (t: DialTime) => void;
  /** Return false to refuse an hour — used to grey out slots already gone. */
  isHourEnabled?: (h24: number) => boolean;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function TimeDialBase({ value, onChange, isHourEnabled }: Props) {
  const isPm = value.h >= 12;
  const hour12 = value.h % 12 === 0 ? 12 : value.h % 12;
  const layout = useRef({ w: SIZE, h: SIZE });

  const to24 = useCallback((h12: number, pm: boolean) => (pm ? (h12 % 12) + 12 : h12 % 12), []);

  const enabled = useCallback(
    (h12: number, pm = isPm) => (isHourEnabled ? isHourEnabled(to24(h12, pm)) : true),
    [isHourEnabled, isPm, to24],
  );

  const pick = useCallback(
    (x: number, y: number) => {
      const dx = x - layout.current.w / 2;
      const dy = y - layout.current.h / 2;
      // Screen y grows downward; rotate so 12 sits straight up.
      const deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      const slot = Math.round(((deg + 360) % 360) / 30) % 12;
      const h12 = slot === 0 ? 12 : slot;
      if (!enabled(h12)) return;
      onChange({ h: to24(h12, isPm), m: value.m });
    },
    [enabled, isPm, onChange, to24, value.m],
  );

  const angle = ((hour12 % 12) * 30 - 90) * (Math.PI / 180);
  const handX = R + Math.cos(angle) * RING;
  const handY = R + Math.sin(angle) * RING;

  return (
    <View style={styles.wrap}>
      <Text style={styles.readout}>
        {pad(hour12)}:{pad(value.m)} {isPm ? 'م' : 'ص'}
      </Text>

      <View
        style={{ width: SIZE, height: SIZE }}
        onLayout={(e) => {
          layout.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => pick(e.nativeEvent.locationX, e.nativeEvent.locationY)}
        onResponderMove={(e) => pick(e.nativeEvent.locationX, e.nativeEvent.locationY)}
      >
        <Svg width={SIZE} height={SIZE}>
          <Circle cx={R} cy={R} r={R - 2} fill="#FAF6F3" stroke="#EFE7E2" strokeWidth={1} />
          <Line
            x1={R}
            y1={R}
            x2={handX}
            y2={handY}
            stroke={colors.brand.red}
            strokeWidth={2}
            strokeLinecap="round"
          />
          <Circle cx={handX} cy={handY} r={17} fill={colors.brand.red} />
          <Circle cx={R} cy={R} r={3.5} fill={colors.brand.red} />
          {HOURS.map((n, i) => {
            const a = (i * 30 - 90) * (Math.PI / 180);
            const on = n === hour12;
            const ok = enabled(n);
            return (
              <SvgText
                key={n}
                x={R + Math.cos(a) * RING}
                y={R + Math.sin(a) * RING}
                fontSize={14}
                fontWeight="bold"
                fill={on ? colors.white : ok ? colors.brand.dark : '#C9BDB5'}
                textAnchor="middle"
                // RN-SVG has no dominantBaseline on Android; nudge instead.
                dy={5}
              >
                {String(n)}
              </SvgText>
            );
          })}
        </Svg>
      </View>

      <View style={[styles.row, { flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row' }]}>
        {[
          { pm: false, t: 'ص' },
          { pm: true, t: 'م' },
        ].map((o) => {
          const on = isPm === o.pm;
          const ok = enabled(hour12, o.pm);
          return (
            <Pressable
              key={o.t}
              onPress={() => ok && onChange({ h: to24(hour12, o.pm), m: value.m })}
              style={[styles.pill, on && styles.pillOn, !ok && styles.pillOff]}
            >
              <Text style={[styles.pillText, on && styles.pillTextOn]}>{o.t}</Text>
            </Pressable>
          );
        })}

        <View style={styles.gap} />

        {QUARTERS.map((mm) => {
          const on = value.m === mm;
          return (
            <Pressable
              key={mm}
              onPress={() => onChange({ h: value.h, m: mm })}
              style={[styles.pill, on && styles.pillOn]}
            >
              <Text style={[styles.pillText, on && styles.pillTextOn]}>:{pad(mm)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export const TimeDial = memo(TimeDialBase);

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.sm },
  readout: {
    fontSize: 24,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyExtraBold,
    includeFontPadding: false,
  },
  row: { alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  gap: { width: spacing.sm },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: '#F2ECE8',
  },
  pillOn: { backgroundColor: colors.brand.red },
  pillOff: { opacity: 0.35 },
  pillText: {
    fontSize: 12.5,
    color: colors.brand.gray,
    fontFamily: fontFamilies.bodyBold,
    includeFontPadding: false,
  },
  pillTextOn: { color: colors.white },
});
