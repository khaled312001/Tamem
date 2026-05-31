import { Eye, EyeOff, Lock } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';

import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

interface PasswordFieldProps extends Omit<TextInputProps, 'secureTextEntry'> {
  Icon?: LucideIcon;
  error?: string;
}

/**
 * Password input with show/hide toggle. Replaces IconField for password
 * fields so the customer can actually see what they typed — Arabic/Latin
 * keyboard switching otherwise causes silent typos and repeated 401s.
 */
export function PasswordField({ Icon = Lock, error, style, ...rest }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.wrap}>
      <View style={[styles.field, error ? styles.errored : null]}>
        <View style={styles.iconWrap}>
          <Icon size={18} color={colors.brand.red} />
        </View>
        <TextInput
          {...rest}
          secureTextEntry={!visible}
          placeholderTextColor={colors.text.muted}
          style={[styles.input, style]}
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
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  field: {
    flexDirection: 'row',
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
  toggle: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSizes.xs,
    marginTop: spacing.xs,
    fontFamily: fontFamilies.body,
  },
});
