import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { CheckCircle2, Home, Lock, MapPin, Phone, Truck, User } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type RegisterInput, registerSchema } from '@tamem/validators';

import { BackChevron } from '../theme/rtl';
import { IconField } from '../components/IconField';
import { PasswordField } from '../components/PasswordField';
import { PrimaryButton } from '../components/ui';
import { api } from '../lib/api';
import { authErrorMessage, isPhoneAlreadyRegistered } from '../lib/authErrors';
import type { AuthStackParamList } from '../navigation/AuthStack';
import {
  colors,
  fontFamilies,
  fontSizes,
  gradients,
  radii,
  shadows,
  spacing,
} from '../theme/tokens';

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
      // If the phone is already registered, give the customer a direct
      // path back to login instead of an information-only error popup.
      if (isPhoneAlreadyRegistered(err)) {
        Alert.alert(
          'هذا الرقم مسجَّل بالفعل',
          'فيه حساب مسجَّل بنفس الرقم. تقدر تسجّل دخول مباشرة.',
          [
            { text: 'تراجع', style: 'cancel' },
            {
              text: 'سجّل دخول',
              onPress: () => navigation.replace('Login'),
            },
          ],
        );
      } else {
        Alert.alert('تعذّر إنشاء الحساب', authErrorMessage(err, 'register'));
      }
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
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
            hitSlop={8}
            accessibilityLabel="رجوع"
          >
            <BackChevron size={20} color={colors.white} />
          </Pressable>
          <View style={styles.heroIconWrap}>
            <Truck size={26} color={colors.white} />
          </View>
          <Text style={styles.heroTitle}>أنشئ حسابك الجديد</Text>
          <Text style={styles.heroSubtitle}>دقيقة واحدة وتقدر تطلب أي حاجة من أي مكان</Text>
        </LinearGradient>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.card, shadows.md]}>
            <Text style={styles.fieldLabel}>الاسم بالكامل</Text>
            <Controller
              control={control}
              name="name"
              render={({ field: { value, onChange, onBlur } }) => (
                <IconField
                  Icon={User}
                  placeholder="مثلاً: أحمد محمد"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.name?.message}
                />
              )}
            />

            <Text style={styles.fieldLabel}>رقم الهاتف</Text>
            <Controller
              control={control}
              name="phone"
              render={({ field: { value, onChange, onBlur } }) => (
                <IconField
                  Icon={Phone}
                  placeholder="مثلاً: 01010254819"
                  keyboardType="phone-pad"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.phone?.message}
                />
              )}
            />

            <View style={styles.fieldsRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>المدينة</Text>
                <Controller
                  control={control}
                  name="city"
                  render={({ field: { value, onChange, onBlur } }) => (
                    <IconField
                      Icon={MapPin}
                      placeholder="قفط"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      error={errors.city?.message}
                    />
                  )}
                />
              </View>
            </View>

            <Text style={styles.fieldLabel}>العنوان (اختياري)</Text>
            <Controller
              control={control}
              name="address"
              render={({ field: { value, onChange, onBlur } }) => (
                <IconField
                  Icon={Home}
                  placeholder="اسم الشارع أو المنطقة"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.address?.message}
                />
              )}
            />

            <Text style={styles.fieldLabel}>كلمة المرور</Text>
            <Controller
              control={control}
              name="password"
              render={({ field: { value, onChange, onBlur } }) => (
                <PasswordField
                  Icon={Lock}
                  placeholder="8 أحرف على الأقل"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.password?.message}
                  autoComplete="new-password"
                />
              )}
            />

            <View style={styles.trustRow}>
              <CheckCircle2 size={14} color={colors.success} />
              <Text style={styles.trustText}>بياناتك مؤمَّنة ولن تظهر لأحد خارج فريق الخدمة</Text>
            </View>

            <View style={{ marginTop: spacing.lg }}>
              <PrimaryButton
                label="إنشاء الحساب"
                onPress={handleSubmit(onSubmit)}
                loading={loading}
              />
            </View>
          </View>

          <Text style={styles.hint}>
            بإنشاء الحساب أنت توافق على{' '}
            <Text
              style={styles.hintLink}
              onPress={() => void Linking.openURL('https://tamem-delivery.com/terms')}
            >
              الشروط والأحكام
            </Text>{' '}
            و{' '}
            <Text
              style={styles.hintLink}
              onPress={() => void Linking.openURL('https://tamem-delivery.com/privacy')}
            >
              سياسة الخصوصية
            </Text>
          </Text>

          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.loginLink, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.loginText}>
              لديك حساب بالفعل؟ <Text style={styles.loginCta}>سجّل دخولك</Text>
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
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    borderBottomLeftRadius: radii.xxl,
    borderBottomRightRadius: radii.xxl,
    alignItems: 'center',
  },
  backBtn: {
    alignSelf: 'flex-start',
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  heroIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
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
    textAlign: 'center',
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
  // Card
  scroll: {
    padding: spacing.lg,
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
  fieldsRow: { flexDirection: 'row', gap: spacing.sm },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    backgroundColor: colors.successLight,
    borderRadius: radii.md,
  },
  trustText: {
    flex: 1,
    fontSize: fontSizes.xs,
    color: colors.success,
    fontFamily: fontFamilies.bodyBold,
    lineHeight: 18,
  },
  hint: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 22,
    fontFamily: fontFamilies.body,
    paddingHorizontal: spacing.md,
  },
  hintLink: {
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyBold,
  },
  loginLink: { alignItems: 'center', marginTop: spacing.lg },
  loginText: {
    color: colors.text.secondary,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.body,
  },
  loginCta: { color: colors.brand.red, fontFamily: fontFamilies.bodyExtraBold },
});
