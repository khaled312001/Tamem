import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { MessageSquare, ShieldCheck } from 'lucide-react-native';
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

import { PrimaryButton } from '../components/ui';
import { BackChevron } from '../theme/rtl';
import { api } from '../lib/api';
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
  // In dev/QA, the backend returns the OTP in the response under `debugCode`.
  // We surface it in a small dev-only banner so testers don't have to chase
  // logs or open a WhatsApp account just to verify a number.
  const [devCode, setDevCode] = useState<string | null>(null);
  const inputs = useRef<Array<TextInput | null>>([]);

  // Auto-fire the FIRST OTP request when the screen mounts. Without this,
  // the customer lands here with a countdown but no code was ever actually
  // sent. The Register screen used to assume `/auth/otp/request` had been
  // dispatched server-side, but it wasn't — fix it client-side here so the
  // contract stays explicit and works for both register and login-by-otp.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.raw.post('/auth/otp/request', { phone });
        if (!cancelled && res.data?.data?.debugCode) {
          setDevCode(String(res.data.data.debugCode));
        }
      } catch {
        /* swallow — the user can hit "إعادة إرسال الكود" manually */
      }
    })();
    return () => {
      cancelled = true;
    };
    // We only fire once per phone — re-firing on every render would burn
    // through the 60s cooldown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const handleChange = (text: string, index: number) => {
    // When the user pastes a 6-digit code, distribute the digits across
    // all the boxes — typing slice(-1) used to drop 5 of the 6 digits.
    const cleanAll = text.replace(/\D/g, '');
    if (cleanAll.length > 1) {
      const next = [...digits];
      const start = index;
      const room = Math.min(cleanAll.length, OTP_LENGTH - start);
      for (let i = 0; i < room; i++) next[start + i] = cleanAll[i]!;
      setDigits(next);
      const focusIdx = Math.min(start + room, OTP_LENGTH - 1);
      inputs.current[focusIdx]?.focus();
      if (next.every((d) => d)) void onSubmit(next.join(''));
      return;
    }
    const clean = cleanAll.slice(-1);
    const next = [...digits];
    next[index] = clean;
    setDigits(next);
    if (clean && index < OTP_LENGTH - 1) inputs.current[index + 1]?.focus();
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
      const res = await api.raw.post('/auth/otp/request', { phone });
      if (res.data?.data?.debugCode) setDevCode(String(res.data.data.debugCode));
      setSecondsLeft(RESEND_SECONDS);
      Alert.alert('تم', 'تم إرسال كود جديد إلى رقم هاتفك');
    } catch {
      Alert.alert('خطأ', 'فشل إرسال الكود، حاول مرة أخرى');
    } finally {
      setResending(false);
    }
  };

  /** Tap the dev banner → fill the boxes + submit. */
  const useDevCode = () => {
    if (!devCode || devCode.length !== OTP_LENGTH) return;
    setDigits(devCode.split(''));
    void onSubmit(devCode);
  };

  // In Arabic RTL the first digit must visually appear on the RIGHT.
  // flex-row already flips, but the cursor focus order needs to follow visually
  // — we render indices 0..N-1 in the array we want focus to follow.
  const orderedIndices = I18nManager.isRTL
    ? Array.from({ length: OTP_LENGTH }, (_, i) => OTP_LENGTH - 1 - i)
    : Array.from({ length: OTP_LENGTH }, (_, i) => i);

  const allFilled = digits.every((d) => d);

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
            <MessageSquare size={28} color={colors.white} />
          </View>
          <Text style={styles.heroTitle}>أدخل كود التحقق</Text>
          <Text style={styles.heroSubtitle}>أرسلنا كود مكوّن من {OTP_LENGTH} أرقام إلى</Text>
          <Text style={styles.heroPhone}>{phone}</Text>
        </LinearGradient>

        <View style={[styles.card, shadows.md]}>
          {/* Dev-only debug-code banner — disappears in production
              because the backend strips `debugCode` from the response. */}
          {devCode && (
            <Pressable onPress={useDevCode} style={styles.devBanner}>
              <Text style={styles.devBannerLabel}>وضع المطور — اضغط لإدخال الكود تلقائياً</Text>
              <Text style={styles.devBannerCode} selectable>
                {devCode}
              </Text>
            </Pressable>
          )}
          <Text style={styles.fieldLabel}>الكود</Text>
          <View style={styles.otpRow}>
            {orderedIndices.map((idx) => {
              const filled = !!digits[idx];
              return (
                <TextInput
                  key={idx}
                  ref={(r) => {
                    inputs.current[idx] = r;
                  }}
                  value={digits[idx]}
                  onChangeText={(t) => handleChange(t, idx)}
                  onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, idx)}
                  keyboardType="number-pad"
                  maxLength={OTP_LENGTH}
                  style={[styles.otpInput, filled && styles.otpInputFilled]}
                  textAlign="center"
                  selectTextOnFocus
                  returnKeyType={idx === OTP_LENGTH - 1 ? 'done' : 'next'}
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                />
              );
            })}
          </View>

          <View style={styles.resendRow}>
            {secondsLeft > 0 ? (
              <Text style={styles.resendDim}>إعادة الإرسال خلال {secondsLeft} ثانية</Text>
            ) : (
              <Pressable onPress={onResend} disabled={resending} hitSlop={6}>
                <Text style={styles.resendActive}>
                  {resending ? 'جاري الإرسال…' : 'إعادة إرسال الكود'}
                </Text>
              </Pressable>
            )}
          </View>

          <View style={{ marginTop: spacing.lg }}>
            <PrimaryButton
              label="تأكيد ودخول"
              onPress={() => onSubmit()}
              disabled={!allFilled}
              loading={loading}
            />
          </View>

          <View style={styles.trustRow}>
            <ShieldCheck size={14} color={colors.success} />
            <Text style={styles.trustText}>
              لن نشارك رقمك مع أي طرف ثالث. الكود صالح لـ 10 دقائق فقط.
            </Text>
          </View>
        </View>

        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backLink, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.backText}>
            الرقم غير صحيح؟ <Text style={styles.backCta}>غيّر الرقم</Text>
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
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
    color: 'rgba(255,255,255,0.85)',
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.body,
    marginTop: 6,
    textAlign: 'center',
  },
  heroPhone: {
    color: colors.white,
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyExtraBold,
    marginTop: 2,
    letterSpacing: 1,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.line,
    margin: spacing.lg,
    padding: spacing.lg,
    marginTop: -spacing.xl,
  },
  fieldLabel: {
    fontSize: fontSizes.sm,
    color: colors.ink,
    fontFamily: fontFamilies.bodyBold,
    marginBottom: spacing.md,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  otpInput: {
    // Fixed width — `flex: 1` was fighting RN Web's RTL/`space-between` and
    // collapsing 5 of the 6 boxes off-screen on Safari.
    width: 44,
    height: 56,
    borderWidth: 2,
    borderColor: colors.line2,
    borderRadius: radii.md,
    fontSize: fontSizes.xl,
    fontFamily: fontFamilies.headingBlack,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  otpInputFilled: {
    borderColor: colors.brand.red,
    backgroundColor: colors.white,
  },
  resendRow: {
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  resendDim: {
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
  },
  resendActive: {
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    padding: spacing.sm,
    backgroundColor: colors.successLight,
    borderRadius: radii.md,
  },
  trustText: {
    flex: 1,
    fontSize: fontSizes.xs,
    color: colors.success,
    fontFamily: fontFamilies.body,
    lineHeight: 18,
  },
  backLink: { alignItems: 'center', marginVertical: spacing.lg },
  backText: {
    color: colors.text.secondary,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.body,
  },
  backCta: { color: colors.brand.red, fontFamily: fontFamilies.bodyExtraBold },
  // Dev banner — bright enough to never be mistaken for prod UI
  devBanner: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    alignItems: 'center',
    gap: 4,
  },
  devBannerLabel: {
    color: '#92400E',
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
  },
  devBannerCode: {
    color: '#92400E',
    fontFamily: fontFamilies.headingBlack,
    fontSize: fontSizes.xxl,
    letterSpacing: 6,
  },
});
