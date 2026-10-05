import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import {
  AlertCircle,
  Lock,
  LogIn,
  Phone,
  Store,
  Truck,
  User as UserIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm, type Resolver } from 'react-hook-form';
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
import type { z } from 'zod';

import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { IconField } from '../components/IconField';
import { PasswordField } from '../components/PasswordField';
import { PrimaryButton } from '../components/ui';
import { api } from '../lib/api';
import { authErrorMessage } from '../lib/authErrors';
import { useSupportWhatsapp, waLink } from '../lib/contacts';
import type { AuthStackParamList } from '../navigation/AuthStack';
import { useAuth, type SignupRole } from '../stores/auth';
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
type LoginRouteProp = RouteProp<AuthStackParamList, 'Login'>;

/** What the fields actually hold, i.e. loginSchema BEFORE its transform. */
type LoginFormValues = z.input<typeof loginSchema>;

// Errors now go through the shared lib/authErrors helper.

export function LoginScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<LoginRouteProp>();
  const initialRole = route.params?.initialRole;
  const setSession = useAuth((s) => s.setSession);
  const [loading, setLoading] = useState(false);
  // Surface the auth error inline (red banner above the submit button) AND
  // via Alert.alert — web's RN Alert sometimes flashes too quickly to read,
  // so the inline banner is the reliable channel.
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const supportWhatsapp = useSupportWhatsapp();
  /** The role to sign up new Google users as. Default customer — the app no
   *  longer asks "عميل أم تاجر؟" up front; merchants sign up via the merchant
   *  link. The backend ignores role for returning users, so this is safe. */
  const resolveGoogleRole = (): Promise<SignupRole | null | undefined> => {
    return Promise.resolve(initialRole ?? 'CUSTOMER');
  };

  // loginSchema ends in a .transform() that folds `phone` into `identifier`, so
  // its INPUT (what the fields hold) and its OUTPUT (what onSubmit receives) are
  // different shapes. Typing the form with only the output made every field name
  // here a lie: `values.phone` was always undefined at submit, so login posted an
  // empty identifier and the server answered "أدخل البريد وكلمة المرور" — for
  // every user, on every build. tsc flagged all of it; the Android build never
  // runs tsc, so it shipped. Keep all three generics.
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues, unknown, LoginInput>({
    // @hookform/resolvers v3 predates react-hook-form's TTransformedValues
    // generic: zodResolver is typed as Resolver<TFieldValues> and cannot express
    // "input shape in, transformed shape out". It DOES hand handleSubmit the
    // parsed output at runtime, so the cast states what actually happens.
    resolver: zodResolver(loginSchema) as unknown as Resolver<LoginFormValues, unknown, LoginInput>,
    defaultValues: { phone: '', password: '' },
  });

  // No reset code — there is no OTP left anywhere in the app. A password is
  // changed by the office, so say that plainly and offer the one tap that
  // actually gets it done rather than a dead end.
  const onForgotPassword = () => {
    Alert.alert(
      'نسيت كلمة المرور؟',
      'كلمة المرور بتتغيّر عن طريق الإدارة. كلّمنا على واتساب وهنعدّلها لك على طول.',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'مراسلة الإدارة',
          onPress: () => {
            void Linking.openURL(
              waLink(
                supportWhatsapp,
                'السلام عليكم، نسيت كلمة مرور حسابي في تطبيق تميم ومحتاج تعديلها.',
              ),
            );
          },
        },
      ],
    );
  };

  const onSubmit = async (values: LoginInput) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // `identifier` is the transform's output: the phone already normalised to
      // +20… (or a lowercased email). Never read `values.phone` here.
      const res = await api.login(values.identifier, values.password, initialRole);
      if (initialRole === 'MERCHANT' && res.user.role !== 'MERCHANT') {
        Alert.alert('حساب غير تاجر', 'هذا الحساب ليس تاجر — هل تريد التسجيل كتاجر؟', [
          { text: 'إلغاء', style: 'cancel' },
          { text: 'التسجيل كتاجر', onPress: () => navigation.navigate('MerchantSignup') },
        ]);
        return;
      }
      await setSession(res.user, res.tokens);
    } catch (err: unknown) {
      const msg = authErrorMessage(err, 'login');
      setErrorMsg(msg);
      Alert.alert('تعذّر تسجيل الدخول', msg);
    } finally {
      setLoading(false);
    }
  };

  const roleBadgeLabel = initialRole === 'MERCHANT' ? 'تاجر' : 'عميل';
  const RoleBadgeIcon = initialRole === 'MERCHANT' ? Store : UserIcon;

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
          {initialRole && (
            <View style={styles.roleBadge}>
              <RoleBadgeIcon size={14} color={colors.white} />
              <Text style={styles.roleBadgeText}>تسجيل دخول كـ {roleBadgeLabel}</Text>
            </View>
          )}
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
                  placeholder="مثال: 01070750167"
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
              <Pressable onPress={onForgotPassword} hitSlop={8}>
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

            {errorMsg ? (
              <View style={styles.errorBanner}>
                <AlertCircle size={16} color={colors.danger} />
                <Text style={styles.errorBannerText}>{errorMsg}</Text>
              </View>
            ) : null}

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

            <GoogleSignInButton
              role={initialRole}
              // Only used when no initialRole — modal asks the user "customer
              // or merchant?" so brand-new Google users land in the right
              // role. Returning users keep their existing role server-side.
              onResolveRole={resolveGoogleRole}
              onError={(msg) => Alert.alert('خطأ', msg)}
            />
          </View>
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
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    backgroundColor: '#FBEAEA',
    borderWidth: 1,
    borderColor: '#F2C2C2',
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  errorBannerText: {
    flex: 1,
    color: colors.danger,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    lineHeight: 20,
    textAlign: 'right',
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
  roleBadge: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  roleBadgeText: {
    color: colors.white,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyExtraBold,
  },
});
