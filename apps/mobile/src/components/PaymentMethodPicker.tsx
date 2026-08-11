import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { Banknote, CreditCard, Smartphone } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '../lib/api';
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
 * Payment method, or the statement that there is only one.
 *
 * Online payment is a switch on the server (`online_payment_enabled`), and it
 * is OFF: /payments/config answers `online: false`, and the checkout route the
 * app would post to does not exist on this backend. While that is true, asking
 * the customer to pick between كاش / فودافون كاش / إنستا باي is offering three
 * doors when two are bricked up — they choose a transfer, no transfer is ever
 * requested, and the driver turns up expecting cash.
 *
 * So the picker collapses to a single stated fact — «الدفع كاش عند الاستلام» —
 * and reports CASH no matter what it was handed. Flip the setting on and the
 * choices come back on their own: this asks the same endpoint the pay-online
 * card and the EasyKash screen ask, under the same query key, so the whole app
 * changes together on one fetch and there is no build to ship.
 */
export function PaymentMethodPicker({ value, onChange }: PaymentMethodPickerProps) {
  const gateway = useQuery({
    queryKey: ['payments-config'],
    queryFn: async () => {
      const res = await api.raw.get('/payments/config');
      return res.data.data as { online?: boolean };
    },
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  // Treat "still asking" and "the request failed" as offline. Cash is the only
  // method that always works, so it is the safe answer to be wrong with.
  const online = gateway.data?.online === true;

  // Force the parent back to CASH whenever online payment is not available —
  // including the case where a stored preference or a stale screen handed us
  // VODAFONE_CASH from a session when it was switched on.
  useEffect(() => {
    if (!online && value !== 'CASH') onChange('CASH');
  }, [online, value, onChange]);

  // Restore the last choice ONLY while there is a choice to restore.
  useEffect(() => {
    if (!online) return;
    void AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === 'CASH' || v === 'VODAFONE_CASH' || v === 'INSTAPAY') {
        if (v !== value) onChange(v);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  const pick = (m: PaymentMethod) => {
    onChange(m);
    void AsyncStorage.setItem(STORAGE_KEY, m).catch(() => undefined);
  };

  if (!online) {
    return (
      <View style={styles.cashCard}>
        <View style={styles.cashIcon}>
          <Banknote size={22} color={colors.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cashTitle}>الدفع كاش عند الاستلام</Text>
          <Text style={styles.cashSub}>
            تدفع للسائق لما يوصلك الطلب. مفيش أي تحويل أو دفع مقدم.
          </Text>
        </View>
      </View>
    );
  }

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
  // Cash-only state — a statement, not a control. Deliberately not shaped like
  // the option pills above: nothing here is pressable, and it should not look
  // like the customer failed to pick something.
  cashCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.brand.redLight,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.brand.red,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  cashIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brand.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cashTitle: {
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.brand.red,
    fontSize: fontSizes.md,
  },
  cashSub: {
    fontFamily: fontFamilies.body,
    color: colors.text.secondary,
    fontSize: fontSizes.xs,
    lineHeight: 18,
    marginTop: 2,
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
