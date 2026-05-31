import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Lock, LogIn, Phone, Truck } from 'lucide-react-native';
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

import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { IconField } from '../components/IconField';
import { PasswordField } from '../components/PasswordField';
import { PrimaryButton } from '../components/ui';
import { api } from '../lib/api';
import { authErrorMessage } from '../lib/authErrors';
import type { AuthStackParamList } from '../navigation/AuthStack';
import { useAuth } from '../stores/auth';
import {
  colors,
  fontFamilies,
  fontSizes,
  gradients,
  radii,
  shadows,
  spacing,
} from '../theme/tokens';

type NavProp = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

// Errors now go through the shared lib/authErrors helper.

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
      Alert.alert('تعذّر تسجيل الدخول', authErrorMessage(err, 'login'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        {/* ─────── Brand hero ─────── */}
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroLogoCircle}>
            <Truck size={28} color={colors.white} />
          </View>
          <Text style={styles.heroTitle}>أهلاً بعودتك</Text>
          <Text style={styles.heroSubtitle}>
            سجّل دخولك لمتابعة طلباتك وإنشاء طلبات جديدة بسهولة
          </Text>
        </LinearGradient>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.card, shadows.md]}>
            <Text style={styles.fieldLabel}>رقم الهاتف</Text>
            <Controller
              control={control}
              name="phone"
              render={({ field: { value, onChange, onBlur } }) => (
                <IconField
                  Icon={Phone}
                  placeholder="مثال: 01010254819"
                  keyboardType="phone-pad"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.phone?.message}
                  autoComplete="tel"
                />
              )}
            />

            <View style={styles.fieldHeader}>
              <Text style={styles.fieldLabel}>كلمة المرور</Text>
              <Pressable onPress={() => navigation.navigate('ForgotPassword')} hitSlop={8}>
                <Text style={styles.forgotText}>نسيت كلمة المرور؟</Text>
              </Pressable>
            </View>
            <Controller
              control={control}
              name="password"
              render={({ field: { value, onChange, onBlur } }) => (
                <PasswordField
                  Icon={Lock}
                  placeholder="••••••••"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.password?.message}
                  autoComplete="password"
                />
              )}
            />

            <View style={{ marginTop: spacing.lg }}>
              <PrimaryButton
                label="تسجيل الدخول"
                onPress={handleSubmit(onSubmit)}
                loading={loading}
                Icon={LogIn}
              />
            </View>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>أو سجّل دخول بحساب جوجل</Text>
              <View style={styles.dividerLine} />
            </View>

            <GoogleSignInButton onError={(msg) => Alert.alert('خطأ', msg)} />
          </View>

          <Pressable
            onPress={() => navigation.navigate('Register')}
            style={({ pressed }) => [styles.registerLink, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.registerText}>
              ليس لديك حساب؟ <Text style={styles.registerCta}>أنشئ حساب جديد</Text>
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
  // Hero
  hero: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    borderBottomLeftRadius: radii.xxl,
    borderBottomRightRadius: radii.xxl,
    alignItems: 'center',
  },
  heroLogoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  heroTitle: {
    color: colors.white,
    fontSize: fontSizes.xxl,
    fontFamily: fontFamilies.headingBlack,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.body,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 22,
    paddingHorizontal: spacing.md,
  },
  // Scroll
  scroll: {
    padding: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    marginTop: -spacing.xl,
  },
  fieldLabel: {
    fontSize: fontSizes.sm,
    color: colors.ink,
    fontFamily: fontFamilies.bodyBold,
    marginBottom: 6,
    marginTop: spacing.sm,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    marginTop: spacing.md,
  },
  forgotText: {
    color: colors.brand.red,
    fontSize: fontSizes.xs,
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
  registerLink: { alignItems: 'center', marginTop: spacing.xl },
  registerText: {
    color: colors.text.secondary,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.body,
  },
  registerCta: { color: colors.brand.red, fontFamily: fontFamilies.bodyExtraBold },
});
