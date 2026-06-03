import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';
import { Lock, Phone, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconField } from '../components/IconField';
import { PasswordField } from '../components/PasswordField';
import { ScreenHeader } from '../components/ScreenHeader';
import { PrimaryButton } from '../components/ui';
import { api } from '../lib/api';
import { authErrorMessage } from '../lib/authErrors';
import { showToast } from '../lib/toast';
import type { AuthStackParamList } from '../navigation/AuthStack';
import { useAuth } from '../stores/auth';
import { colors, fontFamilies, fontSizes, spacing } from '../theme/tokens';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'>;
type Step = 'request' | 'verify';

export function ForgotPasswordScreen() {
  const navigation = useNavigation<Nav>();
  const setSession = useAuth((s) => s.setSession);
  const [step, setStep] = useState<Step>('request');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const requestMut = useMutation({
    mutationFn: () => api.raw.post('/auth/forgot-password', { phone: phone.trim() }),
    onSuccess: (res) => {
      // dev autofill of the OTP code — gated by __DEV__ so it can never
      // ship in a release build.
      if (__DEV__) {
        const debugCode = res.data.data?.debugCode as string | undefined;
        if (debugCode) setCode(debugCode);
      }
      showToast({
        title: 'تم إرسال الكود ✓',
        message: 'تحقق من رسائل الـ SMS / واتساب على هاتفك',
        tone: 'success',
      });
      setStep('verify');
    },
    onError: (err) =>
      showToast({
        title: 'تعذّر إرسال الكود',
        message: authErrorMessage(err, 'reset'),
        tone: 'error',
      }),
  });

  const resetMut = useMutation({
    mutationFn: async () => {
      const r = await api.raw.post('/auth/reset-password', {
        phone: phone.trim(),
        code: code.trim(),
        newPassword,
      });
      return r.data.data as {
        user: { id: string; name: string; phone: string; role: string };
        tokens: { accessToken: string; refreshToken: string };
      };
    },
    onSuccess: async (data) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await setSession(data.user as any, data.tokens);
    },
    onError: (err) =>
      showToast({
        title: 'تعذّر إعادة الضبط',
        message: authErrorMessage(err, 'reset'),
        tone: 'error',
      }),
  });

  const canRequest = phone.trim().length >= 8 && !requestMut.isPending;
  const passwordsMatch = newPassword.length >= 8 && newPassword === confirmPassword;
  const canReset = code.trim().length === 6 && passwordsMatch && !resetMut.isPending;
  const passwordMismatchError =
    confirmPassword.length > 0 && confirmPassword !== newPassword
      ? 'كلمتا المرور غير متطابقتين'
      : undefined;

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader title="استعادة كلمة المرور" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {step === 'request' ? (
            <>
              <View style={styles.banner}>
                <View style={styles.bannerIcon}>
                  <ShieldCheck size={20} color={colors.brand.red} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bannerTitle}>هنبعتلك كود تأكيد</Text>
                  <Text style={styles.bannerSub}>
                    اكتب رقم هاتفك وهنبعت كود من 6 أرقام تستخدمه لإعادة ضبط كلمة المرور
                  </Text>
                </View>
              </View>

              <IconField
                Icon={Phone}
                placeholder="رقم الهاتف"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                autoComplete="tel"
              />

              <View style={{ height: spacing.md }} />
              <PrimaryButton
                label="إرسال كود التحقق"
                onPress={() => canRequest && requestMut.mutate()}
                loading={requestMut.isPending}
                disabled={!canRequest}
              />

              <Pressable onPress={() => navigation.goBack()} style={styles.backLink}>
                <Text style={styles.backText}>تراجع لشاشة الدخول</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.banner}>
                <View style={styles.bannerIcon}>
                  <Lock size={20} color={colors.brand.red} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bannerTitle}>اختر كلمة سر جديدة</Text>
                  <Text style={styles.bannerSub}>الكود صالح لمدة 10 دقائق فقط</Text>
                </View>
              </View>

              <IconField
                Icon={ShieldCheck}
                placeholder="كود التحقق (6 أرقام)"
                keyboardType="numeric"
                maxLength={6}
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
              />

              <PasswordField
                placeholder="كلمة السر الجديدة (8 أحرف على الأقل)"
                value={newPassword}
                onChangeText={setNewPassword}
                autoComplete="new-password"
              />

              <PasswordField
                placeholder="أعد كتابة كلمة السر"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                error={passwordMismatchError}
                autoComplete="new-password"
              />

              <View style={{ height: spacing.md }} />
              <PrimaryButton
                label="تغيير كلمة السر"
                onPress={() => canReset && resetMut.mutate()}
                loading={resetMut.isPending}
                disabled={!canReset}
              />

              <Pressable onPress={() => setStep('request')} style={styles.backLink}>
                <Text style={styles.backText}>لم يصل الكود؟ ارسل مرة أخرى</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, paddingTop: spacing.xl },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.brand.redLight,
    padding: spacing.md,
    borderRadius: 16,
    marginBottom: spacing.lg,
  },
  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: {
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
    fontSize: fontSizes.md,
  },
  bannerSub: {
    fontFamily: fontFamilies.body,
    color: colors.text.secondary,
    fontSize: fontSizes.xs,
    marginTop: 2,
    lineHeight: 18,
  },
  backLink: { alignItems: 'center', marginTop: spacing.lg },
  backText: { color: colors.brand.red, fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.sm },
});
