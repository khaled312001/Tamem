import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { KeyRound, Phone, ShieldCheck } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '../components/GradientButton';
import { IconField } from '../components/IconField';
import { TamemApiError } from '@tamem/api-client';

import { api } from '../lib/api';
import { useSupportWhatsapp, waLink } from '../lib/contacts';
import { useAuth } from '../stores/auth';
import { colors, fontFamilies, fontSizes, gradients, radii, spacing } from '../theme/tokens';

/** Status, code and details from either error shape the client throws. */
function apiError(err: unknown): {
  status: number;
  code?: string;
  claimable: boolean;
  messageAr?: string;
} {
  if (err instanceof TamemApiError) {
    return {
      status: err.status,
      code: err.code,
      claimable: err.details?.claimable === true,
      messageAr: err.messageAr,
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = (err as { response?: { status?: number; data?: any } })?.response;
  const e = r?.data?.error;
  return {
    status: r?.status ?? 0,
    code: e?.code,
    claimable: e?.details?.claimable === true,
    messageAr: e?.messageAr,
  };
}

/**
 * Shown once for Google sign-in users whose phone is still the placeholder
 * `g_<sub>` value. Mandatory before reaching the app — we need a real phone
 * for delivery + WhatsApp notifications.
 *
 * Most customers already have an account under that number (the office made
 * it for a phone order, or they signed up with a password before the app went
 * Google-only). Then a code goes to the number on WhatsApp, and once it is
 * typed the Google login moves onto that account with its orders and
 * addresses (POST /me/phone/claim).
 */
export function CollectPhoneScreen() {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const clear = useAuth((s) => s.clear);
  const setSession = useAuth((s) => s.setSession);
  const qc = useQueryClient();
  const supportWhatsapp = useSupportWhatsapp();
  const [phone, setPhone] = useState('');
  // Set once the number turned out to belong to an older account.
  const [claimPhone, setClaimPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [retryIn, setRetryIn] = useState(0);

  const valid = /^\+?\d{10,15}$/.test(phone.trim().replace(/\s/g, ''));
  const finalPhone = () => {
    const normalized = phone.trim().replace(/\s/g, '');
    return normalized.startsWith('+') ? normalized : `+2${normalized}`;
  };

  useEffect(() => {
    if (retryIn <= 0) return;
    const t = setTimeout(() => setRetryIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [retryIn]);

  const askOffice = () =>
    Alert.alert('الرقم ده متسجل بحساب تاني', 'كلّمنا على واتساب ونربطهولك بحساب جوجل ده.', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'كلّم الإدارة',
        onPress: () => {
          void Linking.openURL(
            waLink(
              supportWhatsapp,
              `السلام عليكم، عايز أربط رقمي ${phone.trim()} بحساب جوجل ${user?.email ?? ''} في تطبيق تميم.`,
            ),
          );
        },
      },
    ]);

  const sendCode = useMutation({
    mutationFn: async (to: string) => {
      const res = await api.raw.post('/me/phone/claim/start', { phone: to });
      return { to, wait: Number(res.data?.data?.retryIn ?? 60) };
    },
    onSuccess: ({ to, wait }) => {
      setClaimPhone(to);
      setCode('');
      setRetryIn(wait);
    },
    onError: (err) => {
      const e = apiError(err);
      if (e.code === 'NOT_CLAIMABLE') return askOffice();
      Alert.alert('خطأ', e.messageAr ?? 'معرفناش نبعت الكود، جرّب تاني');
    },
  });

  const claim = useMutation({
    mutationFn: async () => {
      const res = await api.raw.post('/me/phone/claim', { phone: claimPhone, code: code.trim() });
      return res.data.data as {
        user: Parameters<typeof setSession>[0];
        tokens: Parameters<typeof setSession>[1];
      };
    },
    onSuccess: async ({ user: merged, tokens }) => {
      // Another account from here on: nothing cached for the empty one applies.
      qc.clear();
      await setSession(merged, tokens);
    },
    onError: (err) => {
      const e = apiError(err);
      if (e.code === 'CODE_EXPIRED') setRetryIn(0);
      if (e.code === 'NOT_CLAIMABLE') return askOffice();
      Alert.alert('خطأ', e.messageAr ?? 'الكود مش صحيح');
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const res = await api.raw.patch('/me', { phone: finalPhone() });
      return res.data.data;
    },
    onSuccess: (updated) => {
      if (updated) setUser(updated);
      // No alert — the RootNavigator will reactively swap to AppTabs once
      // user.phone is no longer the `g_*` placeholder.
    },
    onError: (err) => {
      const e = apiError(err);
      if (e.status === 409) {
        // The number already sits on another account, usually one the office
        // made for a phone order. A customer account can be taken over with a
        // WhatsApp code; anything else (a driver's number, one already tied
        // to another Google account) still goes through the office.
        if (e.claimable) sendCode.mutate(finalPhone());
        else askOffice();
        return;
      }
      Alert.alert('خطأ', e.messageAr ?? (err instanceof Error ? err.message : 'فشل حفظ الرقم'));
    },
  });

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <LinearGradient
        colors={gradients.splash}
        locations={[0, 0.18, 0.4, 0.85]}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.body}>
          {/* Icon block */}
          <View style={styles.iconWrap}>
            <View style={styles.iconRing} />
            <View style={styles.iconCircle}>
              <Phone size={36} color={colors.white} />
            </View>
          </View>

          <Text style={styles.title}>أهلاً {user?.name?.split(' ')[0] ?? 'بك'}</Text>
          <Text style={styles.subtitle}>
            {claimPhone
              ? 'رقمك ده عليه حساب عندنا من قبل كده. بعتنالك كود على واتساب، اكتبه هنا وهتلاقي طلباتك وعناوينك القديمة في حسابك.'
              : 'محتاجين رقم تليفونك علشان نقدر نوصلك طلباتك ونبعتلك تأكيد على واتساب.'}
          </Text>

          {claimPhone ? (
            <View style={styles.card}>
              <View style={styles.cardField}>
                <IconField
                  Icon={KeyRound}
                  placeholder="الكود (6 أرقام)"
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  autoComplete="sms-otp"
                  textContentType="oneTimeCode"
                  maxLength={6}
                  autoFocus
                />
              </View>
              <View style={styles.assureRow}>
                <ShieldCheck size={14} color={colors.brand.gold} />
                <Text style={styles.assureText}>
                  الكود اتبعت على واتساب للرقم {claimPhone}، وصالح 10 دقايق.
                </Text>
              </View>
              <GradientButton
                label={claim.isPending ? 'جاري الربط…' : 'تأكيد وادخل'}
                onPress={() => claim.mutate()}
                loading={claim.isPending}
                disabled={code.length !== 6 || claim.isPending}
              />
              <Pressable
                onPress={() => sendCode.mutate(claimPhone)}
                disabled={retryIn > 0 || sendCode.isPending}
                hitSlop={8}
                style={({ pressed }) => [styles.resend, pressed && { opacity: 0.7 }]}
              >
                <Text style={[styles.resendText, retryIn > 0 && { color: colors.text.muted }]}>
                  {retryIn > 0 ? `ابعت الكود تاني بعد ${retryIn} ثانية` : 'ابعت الكود تاني'}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.card}>
              <View style={styles.cardField}>
                <IconField
                  Icon={Phone}
                  placeholder="01XXXXXXXXX أو +201XXXXXXXXX"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  autoFocus
                />
              </View>

              <View style={styles.assureRow}>
                <ShieldCheck size={14} color={colors.brand.gold} />
                <Text style={styles.assureText}>
                  رقمك مش هينظهر لأي عميل تاني — بنستخدمه للتواصل بس.
                </Text>
              </View>

              <GradientButton
                label={save.isPending || sendCode.isPending ? 'جاري الحفظ…' : 'احفظ وادخل'}
                onPress={() => save.mutate()}
                loading={save.isPending || sendCode.isPending}
                disabled={!valid || save.isPending || sendCode.isPending}
              />
            </View>
          )}

          {claimPhone && (
            <Pressable
              onPress={() => {
                setClaimPhone(null);
                setCode('');
              }}
              hitSlop={8}
              style={({ pressed }) => [styles.skip, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.skipText}>غيّر الرقم</Text>
            </Pressable>
          )}
          {claimPhone && (
            <Pressable
              onPress={askOffice}
              hitSlop={8}
              style={({ pressed }) => [styles.skip, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.skipText}>الكود موصلش؟ كلّم الإدارة</Text>
            </Pressable>
          )}

          <Pressable
            onPress={() =>
              Alert.alert(
                'ليه محتاجين رقمك؟',
                'الرقم ضروري عشان نقدر نتواصل معاك وقت إرسال السائق ونبعت إشعارات الطلبات. بدون رقم مش هتقدر تستخدم التطبيق.',
              )
            }
            style={({ pressed }) => [styles.skip, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.skipText}>ليه محتاجين الرقم؟</Text>
          </Pressable>
          <Pressable
            onPress={() => void clear()}
            hitSlop={8}
            style={({ pressed }) => [styles.skip, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.skipText}>ادخل بحساب جوجل تاني</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.brand.redDark },
  flex: { flex: 1 },
  body: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    alignItems: 'center',
  },
  iconWrap: {
    width: 110,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  iconRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1.5,
    borderColor: 'rgba(242,169,59,0.4)',
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  title: {
    color: colors.white,
    fontFamily: fontFamilies.headingBlack,
    fontSize: 26,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: spacing.xl,
    maxWidth: 320,
  },
  card: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md,
    boxShadow: '0 14px 30px rgba(0,0,0,0.18)',
    elevation: 8,
  },
  cardField: {},
  assureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.soft,
    padding: spacing.sm,
    borderRadius: radii.md,
  },
  assureText: {
    flex: 1,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    lineHeight: 18,
  },
  skip: { marginTop: spacing.lg, padding: spacing.sm },
  resend: { alignSelf: 'center', padding: spacing.xs },
  resendText: {
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
  },
  skipText: {
    color: 'rgba(255,255,255,0.65)',
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    textDecorationLine: 'underline',
  },
});
