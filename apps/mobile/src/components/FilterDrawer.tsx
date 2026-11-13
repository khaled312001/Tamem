import { Check, ChevronDown, Search, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

export interface FilterOption {
  /** null = «الكل» for this group. */
  value: string | null;
  label: string;
  count?: number;
}

export interface FilterGroup {
  key: string;
  title: string;
  options: FilterOption[];
  value: string | null;
  onChange: (value: string | null) => void;
}

/** Arabic letters people type either way: أ/إ/آ/ا, ة/ه, ى/ي. */
function looseAr(s: string): string {
  return s
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim()
    .toLowerCase();
}

/**
 * Filters in a panel that slides in from the right (the start side in Arabic).
 *
 * The stores screen stacked three rows of sideways-scrolling chips plus a sort
 * button: the rows ran off the edge, nothing said which ones were on, and a
 * long row (أقسام with dozens of entries) had to be scrolled blind. Here each
 * filter is a titled list that opens and closes, the header of a closed one
 * says what is chosen, long lists get a search box, and the footer clears
 * everything or closes with the number of results.
 *
 * A choice applies at once, so the list behind the panel is already right
 * when it closes.
 */
export function FilterDrawer({
  visible,
  onClose,
  groups,
  onReset,
  resultLabel,
}: {
  visible: boolean;
  onClose: () => void;
  groups: FilterGroup[];
  onReset: () => void;
  /** «عرض 12 محل» */
  resultLabel: string;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const panelW = Math.min(360, Math.round(width * 0.86));
  const slide = useRef(new Animated.Value(panelW)).current;
  const [mounted, setMounted] = useState(visible);
  // The first group, or the one already in use, starts open.
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setOpen((prev) => {
        if (Object.keys(prev).length) return prev;
        const used = groups.find((g) => g.value !== null)?.key ?? groups[0]?.key;
        return used ? { [used]: true } : {};
      });
      slide.setValue(panelW);
      Animated.timing(slide, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(slide, {
        toValue: panelW,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const active = groups.filter((g) => g.value !== null).length;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Row: in Arabic the first child sits on the right. */}
      <View style={styles.row}>
        <Animated.View
          style={[
            styles.panel,
            { width: panelW, paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom },
            { transform: [{ translateX: slide }] },
          ]}
        >
          <View style={styles.head}>
            <Text style={styles.headTitle}>فلترة المحلات</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityLabel="قفل">
              <X size={20} color={colors.ink} />
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            {groups.map((g) => (
              <GroupList
                key={g.key}
                group={g}
                open={!!open[g.key]}
                onToggle={() => setOpen((p) => ({ ...p, [g.key]: !p[g.key] }))}
              />
            ))}
          </ScrollView>

          <View style={styles.foot}>
            <Pressable
              onPress={onReset}
              disabled={active === 0}
              style={({ pressed }) => [styles.reset, (pressed || active === 0) && { opacity: 0.5 }]}
            >
              <Text style={styles.resetText}>مسح الكل</Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.apply, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.applyText}>{resultLabel}</Text>
            </Pressable>
          </View>
        </Animated.View>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="قفل الفلترة" />
      </View>
    </Modal>
  );
}

function GroupList({
  group,
  open,
  onToggle,
}: {
  group: FilterGroup;
  open: boolean;
  onToggle: () => void;
}) {
  const [q, setQ] = useState('');
  const chosen = group.options.find((o) => o.value === group.value);
  const long = group.options.length > 8;
  const k = looseAr(q);
  const shown = k
    ? group.options.filter((o) => o.value === null || looseAr(o.label).includes(k))
    : group.options;

  return (
    <View style={styles.group}>
      <Pressable
        onPress={onToggle}
        style={styles.groupHead}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.groupTitle}>{group.title}</Text>
          <Text
            style={[styles.groupValue, group.value !== null && styles.groupValueOn]}
            numberOfLines={1}
          >
            {chosen?.label ?? 'الكل'}
          </Text>
        </View>
        <ChevronDown
          size={18}
          color={colors.text.muted}
          style={open ? { transform: [{ rotate: '180deg' }] } : undefined}
        />
      </Pressable>

      {open ? (
        <View style={styles.options}>
          {long ? (
            <View style={styles.search}>
              <Search size={15} color={colors.text.muted} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder={`دوّر في ${group.title}…`}
                placeholderTextColor={colors.text.muted}
                style={styles.searchInput}
              />
            </View>
          ) : null}
          {shown.map((o) => {
            const on = o.value === group.value;
            return (
              <Pressable
                key={o.value ?? '__all'}
                onPress={() => group.onChange(o.value)}
                style={({ pressed }) => [
                  styles.option,
                  on && styles.optionOn,
                  pressed && { opacity: 0.8 },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <View style={[styles.radio, on && styles.radioOn]}>
                  {on ? <Check size={12} color={colors.white} /> : null}
                </View>
                <Text style={[styles.optionText, on && styles.optionTextOn]} numberOfLines={1}>
                  {o.label}
                </Text>
                {o.count != null ? <Text style={styles.count}>{o.count}</Text> : null}
              </Pressable>
            );
          })}
          {shown.length === 1 && k ? <Text style={styles.none}>مفيش اسم كده</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.38)' },
  panel: {
    height: '100%',
    backgroundColor: colors.white,
    borderTopStartRadius: 0,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 16,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headTitle: {
    flex: 1,
    fontFamily: fontFamilies.headingBlack,
    fontSize: fontSizes.lg,
    color: colors.ink,
    textAlign: 'right',
  },
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.soft,
  },
  body: { paddingVertical: spacing.sm },
  group: { borderBottomWidth: 1, borderBottomColor: colors.line },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  groupTitle: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
    color: colors.ink,
    textAlign: 'right',
  },
  groupValue: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    marginTop: 2,
    textAlign: 'right',
  },
  groupValueOn: { color: colors.brand.red, fontFamily: fontFamilies.bodyBold },
  options: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: 2 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.ink,
    paddingVertical: spacing.sm,
    textAlign: 'right',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
  },
  optionOn: { backgroundColor: colors.brand.redLight },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.line2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  radioOn: { backgroundColor: colors.brand.red, borderColor: colors.brand.red },
  optionText: {
    flex: 1,
    fontFamily: fontFamilies.bodyMedium,
    fontSize: fontSizes.sm,
    color: colors.ink,
    textAlign: 'right',
  },
  optionTextOn: { fontFamily: fontFamilies.bodyExtraBold, color: colors.brand.red },
  count: { fontFamily: fontFamilies.body, fontSize: fontSizes.xs, color: colors.text.muted },
  none: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  foot: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  reset: {
    paddingHorizontal: spacing.lg,
    minHeight: 46,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetText: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.sm, color: colors.ink },
  apply: {
    flex: 1,
    minHeight: 46,
    borderRadius: radii.pill,
    backgroundColor: colors.brand.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyText: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
    color: colors.white,
  },
});
