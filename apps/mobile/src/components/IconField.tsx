import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';

import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

interface IconFieldProps extends TextInputProps {
  Icon?: LucideIcon;
  error?: string;
  label?: string;
}

/**
 * Form field with an icon on the leading side and inline error text.
 * Matches the design-tamem.html `.pfield` pattern.
 */
export function IconField({ Icon, error, label, style, ...rest }: IconFieldProps) {
  return (
    <View style={styles.wrap}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.field, error ? styles.errored : null]}>
        {Icon && (
          <View style={styles.iconWrap}>
            <Icon size={18} color={colors.brand.red} />
          </View>
        )}
        <TextInput
          {...rest}
          placeholderTextColor={colors.text.muted}
          style={[styles.input, style]}
        />
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyBold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
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
  errorText: {
    color: colors.danger,
    fontSize: fontSizes.xs,
    marginTop: spacing.xs,
    fontFamily: fontFamilies.body,
  },
});
