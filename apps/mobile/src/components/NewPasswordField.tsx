/**
 * The "choose a password" field — used by signup and by password reset, so the
 * two screens cannot drift apart on what a valid password is.
 *
 * What it adds over a plain PasswordField:
 *
 *   - A live checklist instead of one error after submit. The old flow let you
 *     fill the whole form, press تسجيل, and only then learn the password was a
 *     character short. Every rule ticks as you type.
 *   - «توليد» — a strong password in one tap, made of characters that survive
 *     being read aloud (see lib/generatePassword).
 *   - «نسخ» — puts it on the clipboard so it can be pasted into a notes app or
 *     a message before the account is created. A generated password nobody
 *     saved is a lockout waiting to happen, so the button appears the moment
 *     there is something worth keeping.
 *
 * Only the 8-character rule blocks submission, matching what the server
 * actually enforces. The rest guide without trapping anyone.
 */
import { Check, Copy, Eye, EyeOff, Lock, RefreshCw } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { copyToClipboard } from '../lib/clipboard';
import {
  checkPassword,
  generatePassword,
  passwordStrength,
  STRENGTH_LABEL,
  type PasswordStrength,
} from '../lib/generatePassword';
import { showToast } from '../lib/toast';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

const ROW = 'row' as const;

const STRENGTH_COLOR: Record<PasswordStrength, string> = {
  weak: colors.danger,
  fair: colors.brand.gold,
  good: colors.info,
  strong: colors.success,
};

const STRENGTH_STEPS: Record<PasswordStrength, number> = {
  weak: 1,
  fair: 2,
  good: 3,
  strong: 4,
};

interface Props {
  value: string;
  onChangeText: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  /** Validation message from the form; shown instead of the checklist hint. */
  error?: string;
  /** Hide the checklist + generator (e.g. the "confirm password" box). */
  plain?: boolean;
  autoFocus?: boolean;
  /**
   * Fired only when «توليد» produced the value.
   *
   * The reset screen mirrors it into its confirm box: asking someone to retype
   * a 12-character random string they did not choose is how a helpful button
   * becomes an obstacle.
   */
  onGenerated?: (password: string) => void;
}

export function NewPasswordField({
  value,
  onChangeText,
  onBlur,
  placeholder = 'كلمة السر',
  error,
  plain,
  autoFocus,
  onGenerated,
}: Props) {
  // Generated passwords start visible: the whole point is that the customer
  // can read and save it. A password they never saw is one they cannot keep.
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const checks = checkPassword(value);
  const strength = passwordStrength(value);
  const showMeter = !plain && value.length > 0;

  const onGenerate = () => {
    const pw = generatePassword(12);
    onChangeText(pw);
    onGenerated?.(pw);
    setVisible(true);
    setCopied(false);
  };

  const onCopy = async () => {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopied(true);
      showToast({ title: 'اتنسخت — احفظها في مكان آمن', tone: 'success' });
    } else {
      showToast({ title: 'تعذّر النسخ', message: 'اكتبها في مكان آمن قبل ما تكمل', tone: 'error' });
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.field, error ? styles.errored : null]}>
        <View style={styles.iconWrap}>
          <Lock size={18} color={colors.brand.red} />
        </View>
        <TextInput
          value={value}
          onChangeText={(t) => {
            onChangeText(t);
            setCopied(false);
          }}
          onBlur={onBlur}
          placeholder={placeholder}
          placeholderTextColor={colors.text.muted}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={autoFocus}
          // Prompts Google Password Manager / iCloud Keychain to offer saving
          // this on submit — the other half of "keep it for next time".
          autoComplete="new-password"
          textContentType={Platform.OS === 'ios' ? 'newPassword' : undefined}
          style={styles.input}
        />
        <Pressable
          onPress={() => setVisible((v) => !v)}
          hitSlop={6}
          accessibilityLabel={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
          style={({ pressed }) => [styles.toggle, pressed && { opacity: 0.6 }]}
        >
          {visible ? (
            <EyeOff size={18} color={colors.text.muted} />
          ) : (
            <Eye size={18} color={colors.text.muted} />
          )}
        </Pressable>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {plain ? null : (
        <>
          <View style={[styles.actions, { flexDirection: ROW }]}>
            <Pressable
              onPress={onGenerate}
              style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityLabel="توليد كلمة سر قوية"
            >
              <RefreshCw size={14} color={colors.brand.red} />
              <Text style={styles.actionText}>توليد كلمة سر قوية</Text>
            </Pressable>

            {value.length > 0 && (
              <Pressable
                onPress={() => void onCopy()}
                style={({ pressed }) => [
                  styles.actionBtn,
                  copied && styles.actionBtnDone,
                  pressed && { opacity: 0.85 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="نسخ كلمة السر"
              >
                {copied ? (
                  <Check size={14} color={colors.success} />
                ) : (
                  <Copy size={14} color={colors.brand.red} />
                )}
                <Text style={[styles.actionText, copied && { color: colors.success }]}>
                  {copied ? 'اتنسخت' : 'نسخ وحفظ'}
                </Text>
              </Pressable>
            )}
          </View>

          {showMeter && (
            <View style={styles.meterRow}>
              <View style={[styles.meterTrack, { flexDirection: ROW }]}>
                {[1, 2, 3, 4].map((step) => (
                  <View
                    key={step}
                    style={[
                      styles.meterStep,
                      step <= STRENGTH_STEPS[strength] && {
                        backgroundColor: STRENGTH_COLOR[strength],
                      },
                    ]}
                  />
                ))}
              </View>
              <Text style={[styles.meterLabel, { color: STRENGTH_COLOR[strength] }]}>
                {STRENGTH_LABEL[strength]}
              </Text>
            </View>
          )}

          <View style={styles.checks}>
            {checks.map((c) => (
              <View key={c.key} style={[styles.checkRow, { flexDirection: ROW }]}>
                <View
                  style={[
                    styles.checkDot,
                    c.ok && { backgroundColor: colors.success, borderColor: colors.success },
                    !c.ok && c.required && value.length > 0 && { borderColor: colors.danger },
                  ]}
                >
                  {c.ok ? <Check size={9} color={colors.white} strokeWidth={4} /> : null}
                </View>
                <Text
                  style={[
                    styles.checkText,
                    c.ok && { color: colors.success },
                    !c.ok && c.required && value.length > 0 && { color: colors.danger },
                  ]}
                >
                  {c.label}
                  {c.required ? '' : ' (يفضّل)'}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  field: {
    flexDirection: ROW,
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    minHeight: 48,
    gap: spacing.sm,
  },
  errored: { borderColor: colors.danger },
  iconWrap: { width: 22, alignItems: 'center' },
  input: {
    flex: 1,
    fontSize: fontSizes.md,
    color: colors.text.primary,
    textAlign: 'right',
    fontFamily: fontFamilies.body,
    paddingVertical: spacing.md,
  },
  toggle: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  errorText: {
    color: colors.danger,
    fontSize: fontSizes.xs,
    marginTop: spacing.xs,
    fontFamily: fontFamilies.body,
  },
  actions: { gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
  actionBtn: {
    flexDirection: ROW,
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.brand.red,
    backgroundColor: colors.brand.redLight,
  },
  actionBtnDone: { borderColor: colors.success, backgroundColor: colors.successLight },
  actionText: {
    color: colors.brand.red,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  meterRow: {
    flexDirection: ROW,
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  meterTrack: { flex: 1, gap: 4 },
  meterStep: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
  },
  meterLabel: { fontSize: fontSizes.xs, fontFamily: fontFamilies.bodyExtraBold, minWidth: 46 },
  checks: { marginTop: spacing.sm, gap: 5 },
  checkRow: { alignItems: 'center', gap: spacing.xs },
  checkDot: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.line2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
  },
});
