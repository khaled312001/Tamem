import { Clock } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomSheet, Button } from './ui';
import { haptic } from '../lib/haptics';
import { colors, palette, radii, spacing, typography } from '../theme/tokens';

/**
 * SchedulePicker — BottomSheet that lets the customer pick a future delivery
 * window. Returns an ISO timestamp (UTC) via onConfirm, or null to indicate
 * "deliver as soon as possible".
 *
 * Day chips: next 7 days (today + 6).
 * Time chips: 30-minute slots between 10:00 and 22:00.
 *
 * If the picked combination is in the past (today + earlier time), the chip
 * is disabled. There's an "ASAP" chip that returns null.
 */
export interface SchedulePickerProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (iso: string | null) => void;
  initial?: string | null;
}

const DAY_LABELS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTH_LABELS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

// Half-hour slots 10:00 → 22:00 inclusive.
const SLOTS: Array<{ h: number; m: number }> = [];
for (let h = 10; h <= 22; h++) {
  SLOTS.push({ h, m: 0 });
  if (h < 22) SLOTS.push({ h, m: 30 });
}

function formatTime(h: number, m: number): string {
  const period = h >= 12 ? 'م' : 'ص';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${m.toString().padStart(2, '0')} ${period}`;
}

function isToday(d: Date): boolean {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function SchedulePicker({ visible, onClose, onConfirm, initial }: SchedulePickerProps) {
  // Day selection state — today + 6 future days.
  const days = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, []);

  const initialDate = initial ? new Date(initial) : null;
  const initialDayIdx =
    initialDate != null
      ? days.findIndex(
          (d) =>
            d.getFullYear() === initialDate.getFullYear() &&
            d.getMonth() === initialDate.getMonth() &&
            d.getDate() === initialDate.getDate(),
        )
      : -1;

  const [asap, setAsap] = useState<boolean>(initial == null);
  const [dayIdx, setDayIdx] = useState<number>(initialDayIdx >= 0 ? initialDayIdx : 0);
  const [slot, setSlot] = useState<{ h: number; m: number } | null>(
    initialDate != null
      ? { h: initialDate.getHours(), m: initialDate.getMinutes() >= 30 ? 30 : 0 }
      : null,
  );

  const selectedDay = days[dayIdx];

  const handleConfirm = () => {
    haptic.success();
    if (asap) {
      onConfirm(null);
      onClose();
      return;
    }
    if (!slot || !selectedDay) return;
    const d = new Date(selectedDay);
    d.setHours(slot.h, slot.m, 0, 0);
    onConfirm(d.toISOString());
    onClose();
  };

  const canConfirm = asap || !!slot;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="ميعاد التوصيل"
      subtitle="اطلب الآن أو حدّد ميعاد مناسب ليك"
      footer={
        <Button
          label={asap ? 'تأكيد التوصيل فوراً' : 'تأكيد الميعاد'}
          onPress={handleConfirm}
          variant="primary"
          size="lg"
          fullWidth
          disabled={!canConfirm}
        />
      }
    >
      {/* ASAP card */}
      <Pressable
        onPress={() => {
          haptic.tap();
          setAsap(true);
        }}
        style={[
          styles.asapCard,
          asap && { borderColor: palette.red[500], backgroundColor: palette.red[50] },
        ]}
      >
        <View style={[styles.asapIcon, { backgroundColor: asap ? palette.red[500] : colors.soft }]}>
          <Clock size={20} color={asap ? colors.white : colors.text.secondary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typography.bodyBold, { color: colors.ink }]}>توصيل فوري</Text>
          <Text style={[typography.caption, { color: colors.text.muted, marginTop: 2 }]}>
            هنبدأ المراجعة والتسعير في أسرع وقت
          </Text>
        </View>
      </Pressable>

      <View style={styles.orRow}>
        <View style={styles.orLine} />
        <Text style={[typography.captionBold, { color: colors.text.muted }]}>أو حدّد ميعاد</Text>
        <View style={styles.orLine} />
      </View>

      {/* Day chips */}
      <Text style={[typography.captionBold, styles.sectionLabel]}>اختر اليوم</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {days.map((d, i) => {
          const selected = !asap && i === dayIdx;
          return (
            <Pressable
              key={d.toISOString()}
              onPress={() => {
                haptic.tap();
                setAsap(false);
                setDayIdx(i);
              }}
              style={[
                styles.dayChip,
                selected && { borderColor: palette.red[500], backgroundColor: palette.red[500] },
              ]}
            >
              <Text
                style={[
                  typography.overline,
                  { color: selected ? colors.white : colors.text.muted },
                ]}
              >
                {isToday(d) ? 'اليوم' : DAY_LABELS[d.getDay()]}
              </Text>
              <Text
                style={[
                  typography.h3,
                  { color: selected ? colors.white : colors.ink, marginTop: 2 },
                ]}
              >
                {d.getDate()}
              </Text>
              <Text
                style={[
                  typography.caption,
                  { color: selected ? 'rgba(255,255,255,0.8)' : colors.text.muted },
                ]}
              >
                {MONTH_LABELS[d.getMonth()]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Time slot chips */}
      {selectedDay && (
        <>
          <Text style={[typography.captionBold, styles.sectionLabel]}>اختر الميعاد</Text>
          <View style={styles.slotGrid}>
            {SLOTS.map((s) => {
              const slotDate = new Date(selectedDay);
              slotDate.setHours(s.h, s.m, 0, 0);
              const inPast = slotDate.getTime() < Date.now() + 30 * 60 * 1000;
              const selected = !asap && slot?.h === s.h && slot?.m === s.m;
              const label = formatTime(s.h, s.m);
              return (
                <Pressable
                  key={`${s.h}:${s.m}`}
                  onPress={() => {
                    if (inPast) return;
                    haptic.tap();
                    setAsap(false);
                    setSlot(s);
                  }}
                  disabled={inPast}
                  style={[
                    styles.slotChip,
                    selected && {
                      backgroundColor: palette.red[500],
                      borderColor: palette.red[500],
                    },
                    inPast && { opacity: 0.35 },
                  ]}
                >
                  <Text
                    style={[typography.smallBold, { color: selected ? colors.white : colors.ink }]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      <View style={{ height: spacing.lg }} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  asapCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.line2,
    backgroundColor: colors.white,
  },
  asapIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.lg,
  },
  orLine: { flex: 1, height: 1, backgroundColor: colors.line2 },
  sectionLabel: { color: colors.text.muted, marginBottom: spacing.sm },
  chipRow: { gap: spacing.sm, paddingVertical: 4 },
  dayChip: {
    width: 70,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.line2,
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  slotChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.white,
    minWidth: 84,
    alignItems: 'center',
  },
});
