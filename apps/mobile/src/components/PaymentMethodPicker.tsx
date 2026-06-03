import AsyncStorage from '@react-native-async-storage/async-storage';
import { Banknote, CreditCard, Smartphone } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

export type PaymentMethod = 'CASH' | 'VODAFONE_CASH' | 'INSTAPAY';

interface Option {
  key: PaymentMethod;
  label: string;
  sub: string;
  Icon: LucideIcon;
}

const OPTIONS: Option[] = [
  { key: 'CASH', label: 'كاش عند الاستلام', sub: 'ادفع للسائق', Icon: Banknote },
  { key: 'VODAFONE_CASH', label: 'فودافون كاش', sub: 'تحويل + لقطة شاشة', Icon: Smartphone },
  { key: 'INSTAPAY', label: 'إنستا باي', sub: 'تحويل + إثبات', Icon: Smartphone },
];

const STORAGE_KEY = '@tamem/last-payment-method';

interface PaymentMethodPickerProps {
  value: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
}

/**
 * Pill grid for the three real payment methods. Persists the last choice in
 * AsyncStorage so the next order pre-selects it.
 */
export function PaymentMethodPicker({ value, onChange }: PaymentMethodPickerProps) {
  // Hydrate the last picked method on first mount (best-effort).
  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === 'CASH' || v === 'VODAFONE_CASH' || v === 'INSTAPAY') {
        if (v !== value) onChange(v);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (m: PaymentMethod) => {
    onChange(m);
    void AsyncStorage.setItem(STORAGE_KEY, m).catch(() => undefined);
  };

  return (
    <View style={styles.row}>
      {OPTIONS.map((opt) => {
        const active = value === opt.key;
        return (
          <Pressable
            key={opt.key}
            onPress={() => pick(opt.key)}
            style={({ pressed }) => [
              styles.option,
              active && styles.optionActive,
              pressed && { opacity: 0.92 },
            ]}
            accessibilityLabel={`اختيار ${opt.label}`}
          >
            <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
              <opt.Icon size={18} color={active ? colors.white : colors.brand.red} />
            </View>
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {opt.label}
            </Text>
            <Text style={[styles.sub, active && styles.subActive]} numberOfLines={1}>
              {opt.sub}
            </Text>
          </Pressable>
        );
      })}
      <View style={styles.disabledOption}>
        <View style={styles.iconWrap}>
          <CreditCard size={18} color={colors.text.muted} />
        </View>
        <Text style={styles.disabledLabel} numberOfLines={1}>
          بطاقة
        </Text>
        <Text style={styles.disabledSub} numberOfLines={1}>
          قريباً
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  option: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: 4,
  },
  optionActive: {
    backgroundColor: colors.brand.redLight,
    borderColor: colors.brand.red,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  iconWrapActive: { backgroundColor: colors.brand.red },
  label: {
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
    fontSize: fontSizes.sm,
  },
  labelActive: { color: colors.brand.red },
  sub: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.xs,
  },
  subActive: { color: colors.brand.red },
  disabledOption: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: 4,
    opacity: 0.6,
  },
  disabledLabel: {
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.text.muted,
    fontSize: fontSizes.sm,
  },
  disabledSub: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.xs,
  },
});
