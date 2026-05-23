import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  I18nManager,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../lib/api';
import type { AuthStackParamList } from '../navigation/AuthStack';
import { useAuth } from '../stores/auth';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

type NavProp = NativeStackNavigationProp<AuthStackParamList, 'OtpVerify'>;
type RouteParam = RouteProp<AuthStackParamList, 'OtpVerify'>;

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

export function OtpVerifyScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteParam>();
  const phone = route.params.phone;
  const setSession = useAuth((s) => s.setSession);

  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const inputs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const handleChange = (text: string, index: number) => {
    // Only accept digits, single char
    const clean = text.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = clean;
    setDigits(next);
    if (clean && index < OTP_LENGTH - 1) inputs.current[index + 1]?.focus();
    // Auto-submit when complete
    if (next.every((d) => d) && index === OTP_LENGTH - 1) {
      void onSubmit(next.join(''));
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const onSubmit = async (codeOverride?: string) => {
    const code = codeOverride ?? digits.join('');
    if (code.length !== OTP_LENGTH) {
      Alert.alert('خطأ', `الرجاء إدخال ${OTP_LENGTH} أرقام`);
      return;
    }
    setLoading(true);
    try {
      const res = await api.raw.post('/auth/otp/verify', { phone, code });
      const { user, tokens } = res.data.data;
      await setSession(user, tokens);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'كود التحقق غير صحيح';
      Alert.alert('خطأ', msg);
      setDigits(Array(OTP_LENGTH).fill(''));
      inputs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    setResending(true);
    try {
      await api.raw.post('/auth/otp/request', { phone });
      setSecondsLeft(RESEND_SECONDS);
      Alert.alert('تم', 'تم إرسال كود جديد');
    } catch {
      Alert.alert('خطأ', 'فشل إرسال الكود، حاول مرة أخرى');
    } finally {
      setResending(false);
    }
  };

  // Order indices visually right-to-left in RTL so first digit appears on the right
  const orderedIndices = I18nManager.isRTL
    ? Array.from({ length: OTP_LENGTH }, (_, i) => OTP_LENGTH - 1 - i)
    : Array.from({ length: OTP_LENGTH }, (_, i) => i);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.content}>
          <Text style={styles.title}>تأكيد رقم الهاتف</Text>
          <Text style={styles.subtitle}>
            أرسلنا كود تحقق إلى{'\n'}
            <Text style={styles.phone}>{phone}</Text>
          </Text>

          <View style={styles.otpRow}>
            {orderedIndices.map((idx) => (
              <TextInput
                key={idx}
                ref={(r) => {
                  inputs.current[idx] = r;
                }}
                value={digits[idx]}
                onChangeText={(t) => handleChange(t, idx)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, idx)}
                keyboardType="number-pad"
                maxLength={1}
                style={styles.otpInput}
                textAlign="center"
                selectTextOnFocus
                returnKeyType={idx === OTP_LENGTH - 1 ? 'done' : 'next'}
              />
            ))}
          </View>

          <Pressable
            onPress={() => onSubmit()}
            disabled={loading || digits.some((d) => !d)}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              (loading || digits.some((d) => !d)) && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.buttonText}>{loading ? 'جاري التحقق…' : 'تأكيد'}</Text>
          </Pressable>

          <View style={styles.resendRow}>
            {secondsLeft > 0 ? (
              <Text style={styles.resendDim}>إعادة الإرسال خلال {secondsLeft}ث</Text>
            ) : (
              <Pressable onPress={onResend} disabled={resending}>
                <Text style={styles.resendActive}>
                  {resending ? 'جاري الإرسال…' : 'إعادة إرسال الكود'}
                </Text>
              </Pressable>
            )}
          </View>

          <Pressable onPress={() => navigation.goBack()} style={styles.backLink}>
            <Text style={styles.backText}>تغيير رقم الهاتف</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  content: { flex: 1, padding: spacing.xl, justifyContent: 'center' },
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
    marginBottom: spacing.xxl,
    textAlign: 'center',
    fontFamily: fontFamilies.body,
    lineHeight: 22,
  },
  phone: {
    color: colors.text.primary,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.md,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xxl,
    gap: spacing.sm,
  },
  otpInput: {
    flex: 1,
    height: 56,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.md,
    fontSize: fontSizes.xl,
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.text.primary,
    backgroundColor: colors.surface,
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
  resendRow: { alignItems: 'center', marginTop: spacing.lg },
  resendDim: {
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
  },
  resendActive: {
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
  },
  backLink: { alignItems: 'center', marginTop: spacing.xl },
  backText: {
    color: colors.text.secondary,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.body,
    textDecorationLine: 'underline',
  },
});
