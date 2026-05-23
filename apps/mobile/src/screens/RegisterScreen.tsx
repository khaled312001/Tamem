import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Home, Lock, MapPin, Phone, User } from 'lucide-react-native';
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
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type RegisterInput, registerSchema } from '@tamem/validators';

import { GradientButton } from '../components/GradientButton';
import { IconField } from '../components/IconField';
import { api } from '../lib/api';
import type { AuthStackParamList } from '../navigation/AuthStack';
import { colors, fontFamilies, fontSizes, spacing } from '../theme/tokens';

type NavProp = NativeStackNavigationProp<AuthStackParamList, 'Register'>;

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
              <IconField
                Icon={User}
                placeholder="الاسم بالكامل"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.name?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="phone"
            render={({ field: { value, onChange, onBlur } }) => (
              <IconField
                Icon={Phone}
                placeholder="رقم الهاتف +201XXXXXXXXX"
                keyboardType="phone-pad"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.phone?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="city"
            render={({ field: { value, onChange, onBlur } }) => (
              <IconField
                Icon={MapPin}
                placeholder="المدينة (مثل: قفط)"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.city?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="address"
            render={({ field: { value, onChange, onBlur } }) => (
              <IconField
                Icon={Home}
                placeholder="العنوان (اختياري)"
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.address?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field: { value, onChange, onBlur } }) => (
              <IconField
                Icon={Lock}
                placeholder="كلمة المرور (8 أحرف على الأقل)"
                secureTextEntry
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.password?.message}
              />
            )}
          />

          <View style={styles.spacer} />
          <GradientButton
            label={loading ? 'جاري الإنشاء…' : 'إنشاء الحساب'}
            onPress={handleSubmit(onSubmit)}
            loading={loading}
          />

          <Text style={styles.hint}>
            التسجيل متاح للعملاء — التجار والسائقون يُضافون من لوحة التحكم بعد المراجعة
          </Text>

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
  container: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: spacing.xl, paddingTop: spacing.xxl },
  title: {
    fontSize: fontSizes.xl,
    fontFamily: fontFamilies.headingBlack,
    color: colors.ink,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSizes.sm,
    color: colors.text.muted,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
    textAlign: 'center',
    fontFamily: fontFamilies.body,
  },
  spacer: { height: spacing.sm },
  hint: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 18,
    fontFamily: fontFamilies.body,
  },
  loginLink: { alignItems: 'center', marginTop: spacing.xl },
  loginText: {
    color: colors.text.secondary,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.body,
  },
  loginCta: { color: colors.brand.red, fontFamily: fontFamilies.bodyBold },
});
