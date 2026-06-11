import { useMutation } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Phone, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
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
import { api } from '../lib/api';
import { useAuth } from '../stores/auth';
import { colors, fontFamilies, fontSizes, gradients, radii, spacing } from '../theme/tokens';

/**
 * Shown once for Google sign-in users whose phone is still the placeholder
 * `g_<sub>` value. Mandatory before reaching the app — we need a real phone
 * for delivery + WhatsApp notifications.
 */
export function CollectPhoneScreen() {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const [phone, setPhone] = useState('');

  const valid = /^\+?\d{10,15}$/.test(phone.trim().replace(/\s/g, ''));

  const save = useMutation({
    mutationFn: async () => {
      const normalized = phone.trim().replace(/\s/g, '');
      const finalPhone = normalized.startsWith('+') ? normalized : `+2${normalized}`;
      const res = await api.raw.patch('/me', { phone: finalPhone });
      return res.data.data;
    },
    onSuccess: (updated) => {
      if (updated) setUser(updated);
      // No alert — the RootNavigator will reactively swap to AppTabs once
      // user.phone is no longer the `g_*` placeholder.
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'فشل حفظ الرقم';
      Alert.alert('خطأ', msg.includes('مستخدم') ? 'هذا الرقم مرتبط بحساب آخر بالفعل' : msg);
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
            محتاجين رقم تليفونك علشان نقدر نوصلك طلباتك ونبعتلك تأكيد على واتساب.
          </Text>

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
              label={save.isPending ? 'جاري الحفظ…' : 'احفظ وادخل'}
              onPress={() => save.mutate()}
              loading={save.isPending}
              disabled={!valid || save.isPending}
            />
          </View>

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
  skipText: {
    color: 'rgba(255,255,255,0.65)',
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    textDecorationLine: 'underline',
  },
});
