import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type RegisterInput, registerSchema } from '@tamem/validators';

import { api } from '../lib/api';
import type { AuthStackParamList } from '../navigation/AuthStack';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

type NavProp = NativeStackNavigationProp<AuthStackParamList, 'Register'>;

interface FieldProps {
  label: string;
  placeholder?: string;
  error?: string;
  keyboardType?: 'default' | 'phone-pad' | 'email-address';
  secureTextEntry?: boolean;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
}

function Field({ label, error, value, onChange, onBlur, ...rest }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        onBlur={onBlur}
        placeholderTextColor={colors.text.muted}
        style={[styles.input, error && styles.inputError]}
        {...rest}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

export function RegisterScreen() {
  const navigation = useNavigation<NavProp>();
  const [loading, setLoading] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', phone: '', password: '', city: 'قفط', address: '' },
  });

  const onSubmit = async (values: RegisterInput) => {
    setLoading(true);
    try {
      await api.raw.post('/auth/register', values);
      navigation.replace('OtpVerify', { phone: values.phone });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل إنشاء الحساب';
      Alert.alert('خطأ', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>إنشاء حساب جديد</Text>
          <Text style={styles.subtitle}>دقيقة واحدة وتبدأ معنا</Text>

          <Controller
            control={control}
            name="name"
            render={({ field: { value, onChange, onBlur } }) => (
              <Field
                label="الاسم بالكامل"
                placeholder="محمد أحمد"
                value={value}
                onChange={onChange}
                onBlur={onBlur}
                error={errors.name?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="phone"
            render={({ field: { value, onChange, onBlur } }) => (
              <Field
                label="رقم الهاتف"
                placeholder="+201XXXXXXXXX"
                keyboardType="phone-pad"
                value={value}
                onChange={onChange}
                onBlur={onBlur}
                error={errors.phone?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="city"
            render={({ field: { value, onChange, onBlur } }) => (
              <Field
                label="المدينة"
                placeholder="قفط"
                value={value}
                onChange={onChange}
                onBlur={onBlur}
                error={errors.city?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="address"
            render={({ field: { value, onChange, onBlur } }) => (
              <Field
                label="العنوان (اختياري)"
                placeholder="مثال: شارع الجمهورية، بجوار المسجد"
                value={value ?? ''}
                onChange={onChange}
                onBlur={onBlur}
                error={errors.address?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field: { value, onChange, onBlur } }) => (
              <Field
                label="كلمة المرور"
                placeholder="على الأقل 8 أحرف"
                secureTextEntry
                value={value}
                onChange={onChange}
                onBlur={onBlur}
                error={errors.password?.message}
              />
            )}
          />

          <View style={styles.hint}>
            <Text style={styles.hintText}>
              التسجيل متاح للعملاء — السائقون والتجار يُضافون من إدارة تميم بعد المراجعة.
            </Text>
          </View>

          <Pressable
            onPress={handleSubmit(onSubmit)}
            disabled={loading}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              loading && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.buttonText}>{loading ? 'جاري الإنشاء…' : 'إنشاء الحساب'}</Text>
          </Pressable>

          <Pressable onPress={() => navigation.goBack()} style={styles.loginLink}>
            <Text style={styles.loginText}>
              لديك حساب؟ <Text style={styles.loginCta}>سجّل دخولك</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: spacing.xl, paddingTop: spacing.xxl },
  title: {
    fontSize: fontSizes.xxl,
    fontFamily: fontFamilies.headingBlack,
    color: colors.text.primary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSizes.sm,
    color: colors.text.muted,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    textAlign: 'center',
    fontFamily: fontFamilies.body,
  },
  field: { marginBottom: spacing.md },
  label: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyBold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: fontSizes.md,
    color: colors.text.primary,
    textAlign: 'right',
    fontFamily: fontFamilies.body,
  },
  inputError: { borderColor: colors.danger },
  errorText: {
    color: colors.danger,
    fontSize: fontSizes.xs,
    marginTop: spacing.xs,
    fontFamily: fontFamilies.body,
  },
  hint: {
    backgroundColor: colors.brand.gold + '20',
    padding: spacing.md,
    borderRadius: radii.md,
    marginVertical: spacing.lg,
  },
  hintText: {
    fontSize: fontSizes.xs,
    color: colors.text.secondary,
    fontFamily: fontFamilies.body,
    lineHeight: 18,
  },
  button: {
    backgroundColor: colors.brand.red,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    color: colors.white,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.md,
  },
  loginLink: { alignItems: 'center', marginTop: spacing.xl },
  loginText: {
    color: colors.text.secondary,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.body,
  },
  loginCta: {
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyBold,
  },
});
