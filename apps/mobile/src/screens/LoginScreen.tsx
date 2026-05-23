import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Lock, Phone, Truck } from 'lucide-react-native';
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

import { type LoginInput, loginSchema } from '@tamem/validators';

import { GradientButton } from '../components/GradientButton';
import { IconField } from '../components/IconField';
import { api } from '../lib/api';
import type { AuthStackParamList } from '../navigation/AuthStack';
import { useAuth } from '../stores/auth';
import { colors, fontFamilies, fontSizes, gradients, radii, spacing } from '../theme/tokens';

type NavProp = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

export function LoginScreen() {
  const navigation = useNavigation<NavProp>();
  const setSession = useAuth((s) => s.setSession);
  const [loading, setLoading] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phone: '', password: '' },
  });

  const onSubmit = async (values: LoginInput) => {
    setLoading(true);
    try {
      const res = await api.login(values.phone, values.password);
      await setSession(res.user, res.tokens);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل تسجيل الدخول';
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
          {/* Brand header */}
          <View style={styles.brandRow}>
            <LinearGradient
              colors={gradients.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.brandIcon}
            >
              <Truck size={22} color={colors.white} />
            </LinearGradient>
            <View>
              <Text style={styles.title}>أهلاً بك من جديد</Text>
              <Text style={styles.subtitle}>سجّل دخولك لتبدأ الطلب</Text>
            </View>
          </View>

          {/* Fields */}
          <Controller
            control={control}
            name="phone"
            render={({ field: { value, onChange, onBlur } }) => (
              <IconField
                Icon={Phone}
                placeholder="رقم الهاتف"
                keyboardType="phone-pad"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.phone?.message}
                autoComplete="tel"
              />
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field: { value, onChange, onBlur } }) => (
              <IconField
                Icon={Lock}
                placeholder="كلمة المرور"
                secureTextEntry
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.password?.message}
                autoComplete="password"
              />
            )}
          />

          <Pressable style={styles.forgotLink}>
            <Text style={styles.forgotText}>نسيت كلمة المرور؟</Text>
          </Pressable>

          <GradientButton
            label={loading ? 'جاري الدخول…' : 'تسجيل الدخول'}
            onPress={handleSubmit(onSubmit)}
            loading={loading}
          />

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>أو سجّل بـ</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Google (placeholder for now) */}
          <Pressable
            style={({ pressed }) => [styles.googleBtn, pressed && styles.pressed]}
            onPress={() => Alert.alert('قريباً', 'تسجيل الدخول بحساب جوجل قيد التفعيل')}
          >
            <Text style={styles.googleText}>الدخول بحساب جوجل</Text>
          </Pressable>

          <Pressable onPress={() => navigation.navigate('Register')} style={styles.registerLink}>
            <Text style={styles.registerText}>
              ليس لديك حساب؟ <Text style={styles.registerCta}>أنشئ حساب</Text>
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
  content: { flexGrow: 1, padding: spacing.xl, paddingTop: spacing.xxl, justifyContent: 'center' },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  brandIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.headingBlack,
    color: colors.ink,
  },
  subtitle: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    marginTop: 2,
  },
  forgotLink: { alignSelf: 'flex-start', marginVertical: spacing.sm },
  forgotText: {
    color: colors.brand.red,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyBold,
  },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.line2 },
  dividerText: {
    marginHorizontal: spacing.md,
    color: colors.text.muted,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.body,
  },
  googleBtn: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.line2,
    minHeight: 50,
    justifyContent: 'center',
  },
  googleText: { color: colors.ink, fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.md },
  pressed: { opacity: 0.85 },
  registerLink: { alignItems: 'center', marginTop: spacing.xl },
  registerText: {
    color: colors.text.secondary,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.body,
  },
  registerCta: { color: colors.brand.red, fontFamily: fontFamilies.bodyBold },
});
