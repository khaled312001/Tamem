import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Tag, X as XIcon } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from '../lib/api';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

interface CouponValidationResult {
  valid: boolean;
  reason?: string;
  discount?: number;
  type?: 'PERCENTAGE' | 'FLAT';
  value?: number;
  finalAmount?: number;
}

interface CouponInputProps {
  /** Total order amount BEFORE discount, in EGP. */
  orderAmount: number;
  /** Called with the applied code + discount when validation succeeds. */
  onApplied: (code: string, discount: number, finalAmount: number) => void;
  /** Called when the customer clears the applied code. */
  onCleared: () => void;
}

/**
 * Reusable coupon input. Customer types a code, we validate against
 * /coupons/validate, and surface the discount inline. Once applied the row
 * collapses into a confirmation strip with a remove button.
 */
export function CouponInput({ orderAmount, onApplied, onCleared }: CouponInputProps) {
  const [code, setCode] = useState('');
  const [applied, setApplied] = useState<{
    code: string;
    discount: number;
    finalAmount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validateMut = useMutation({
    mutationFn: async () => {
      const res = await api.raw.post('/coupons/validate', {
        code: code.trim().toUpperCase(),
        orderAmount: Math.max(0, orderAmount),
      });
      return res.data.data as CouponValidationResult;
    },
    onSuccess: (result) => {
      if (result.valid && typeof result.discount === 'number') {
        const finalAmount = result.finalAmount ?? Math.max(0, orderAmount - result.discount);
        const cleanCode = code.trim().toUpperCase();
        setApplied({ code: cleanCode, discount: result.discount, finalAmount });
        setError(null);
        onApplied(cleanCode, result.discount, finalAmount);
      } else {
        setError(result.reason ?? 'الكود غير صالح');
        setApplied(null);
      }
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'تعذّر التحقق من الكود');
      setApplied(null);
    },
  });

  if (applied) {
    return (
      <View style={styles.appliedCard}>
        <View style={styles.appliedIconWrap}>
          <CheckCircle2 size={18} color={colors.success} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.appliedTitle}>
            تم تطبيق الكوبون <Text style={styles.appliedCode}>{applied.code}</Text>
          </Text>
          <Text style={styles.appliedSub}>
            خصم {applied.discount.toLocaleString('ar-EG')} ج.م · الإجمالي{' '}
            {applied.finalAmount.toLocaleString('ar-EG')} ج.م
          </Text>
        </View>
        <Pressable
          onPress={() => {
            setApplied(null);
            setCode('');
            setError(null);
            onCleared();
          }}
          style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.7 }]}
          hitSlop={6}
          accessibilityLabel="إزالة الكوبون"
        >
          <XIcon size={14} color={colors.text.muted} />
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.inputRow}>
        <View style={styles.inputIconWrap}>
          <Tag size={16} color={colors.brand.red} />
        </View>
        <TextInput
          value={code}
          onChangeText={(t) => {
            setCode(t.toUpperCase());
            if (error) setError(null);
          }}
          placeholder="عندك كوبون خصم؟ أدخله هنا"
          placeholderTextColor={colors.text.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={40}
          style={styles.input}
          onSubmitEditing={() => {
            if (code.trim().length >= 3) validateMut.mutate();
          }}
        />
        <Pressable
          onPress={() => validateMut.mutate()}
          disabled={code.trim().length < 3 || validateMut.isPending}
          style={({ pressed }) => [
            styles.applyBtn,
            (code.trim().length < 3 || validateMut.isPending) && { opacity: 0.5 },
            pressed && { opacity: 0.85 },
          ]}
        >
          {validateMut.isPending ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.applyBtnText}>تطبيق</Text>
          )}
        </Pressable>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  inputIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.ink,
    paddingVertical: spacing.sm,
    letterSpacing: 1,
  },
  applyBtn: {
    backgroundColor: colors.brand.red,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radii.md,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: {
    color: colors.white,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
  },
  errorText: {
    marginTop: 6,
    color: colors.danger,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
  },
  // Applied state
  appliedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.successLight,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.success,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  appliedIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appliedTitle: {
    fontFamily: fontFamilies.bodyBold,
    color: colors.success,
    fontSize: fontSizes.sm,
  },
  appliedCode: {
    fontFamily: fontFamilies.headingBold,
  },
  appliedSub: {
    fontFamily: fontFamilies.body,
    color: colors.success,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
