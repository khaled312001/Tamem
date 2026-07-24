/**
 * A live countdown for a timed offer ("عرض اليوم"). Ticks every second and,
 * the moment it reaches zero, calls onExpire so the parent can drop the deal
 * (and the price reverts everywhere via productPrice, which ignores an expired
 * saleEndsAt). Renders nothing once expired.
 *
 * Compact by default (a pill to sit over a product image); `size="lg"` is for
 * the deals screen hero.
 */
import { Timer } from 'lucide-react-native';
import { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, radii } from '../theme/tokens';

const ROW = 'row' as const;

interface Props {
  /** ISO timestamp when the offer ends. */
  endsAt: string;
  onExpire?: () => void;
  size?: 'sm' | 'lg';
}

function remaining(endsAt: string): number {
  const end = Date.parse(endsAt);
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, end - Date.now());
}

/** ms → "H:MM:SS" (or "MM:SS" under an hour, or "Xي HH:MM" over a day). */
function fmt(ms: number): string {
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (days > 0) return `${days}ي ${pad(h)}:${pad(m)}`;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function CountdownBadgeBase({ endsAt, onExpire, size = 'sm' }: Props) {
  const [ms, setMs] = useState(() => remaining(endsAt));

  useEffect(() => {
    setMs(remaining(endsAt));
    const id = setInterval(() => {
      const left = remaining(endsAt);
      setMs(left);
      if (left <= 0) {
        clearInterval(id);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [endsAt, onExpire]);

  if (ms <= 0) return null;

  // Under an hour is the urgent window — flip the badge to a hotter colour.
  const urgent = ms < 3600_000;
  const lg = size === 'lg';

  return (
    <View
      style={[
        styles.badge,
        { flexDirection: ROW },
        urgent ? styles.urgent : styles.normal,
        lg && styles.badgeLg,
      ]}
    >
      <Timer size={lg ? 16 : 12} color={colors.white} />
      <Text style={[styles.text, lg && styles.textLg]} numberOfLines={1}>
        {fmt(ms)}
      </Text>
    </View>
  );
}

export const CountdownBadge = memo(CountdownBadgeBase);

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeLg: { paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  normal: { backgroundColor: 'rgba(36,19,16,0.82)' },
  // Brand red, slightly translucent, for the last hour.
  urgent: { backgroundColor: 'rgba(224,48,30,0.92)' },
  text: {
    color: colors.white,
    fontSize: 11,
    fontFamily: fontFamilies.bodyExtraBold,
    lineHeight: 16,
    includeFontPadding: false,
    // Tabular so the digits don't jitter as they tick.
    fontVariant: ['tabular-nums'],
  },
  textLg: { fontSize: 15, lineHeight: 22 },
});
