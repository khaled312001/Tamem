import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Gift,
  MapPin,
  Package,
  Sparkles,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth } from '../stores/auth';
import { colors, fontFamilies, fontSizes, gradients, radii, spacing } from '../theme/tokens';

const SEEN_KEY = '@tamem/onboarding_seen_v1';

interface Step {
  Icon: typeof Sparkles;
  title: string;
  body: string;
  accent: readonly [string, string, ...string[]];
}

const STEPS: Step[] = [
  {
    Icon: Sparkles,
    title: 'مرحبا بك في تميم',
    body: 'منصة توصيل وشحن متكاملة تخدمك في قفط وقنا وعموم الصعيد. اطلب أي حاجة، احنا نوصّلها.',
    accent: gradients.brand,
  },
  {
    Icon: Package,
    title: 'اطلب بأي طريقة تريحك',
    body: 'اضغط الزر السريع للطلب بنص، صورة، أو رسالة صوتية. أو اختار من القائمة لو عايز خيارات أدق.',
    accent: gradients.brandGold,
  },
  {
    Icon: MapPin,
    title: 'احفظ عناوينك مرة واحدة',
    body: 'سجّل البيت والشغل في "العناوين المحفوظة" ووفّر وقت الكتابة كل مرة.',
    accent: gradients.brand,
  },
  {
    Icon: Gift,
    title: '5% مكافأة على كل طلب',
    body: 'كل طلب تكمله بيتراكم منه 5% في محفظتك تستخدمه في طلبك التالي.',
    accent: gradients.brandGold,
  },
  {
    Icon: Bell,
    title: 'تابع طلباتك لحظة بلحظة',
    body: 'هتوصلك إشعارات بكل تحديث في حالة طلبك من المراجعة لحد التسليم.',
    accent: gradients.brand,
  },
];

/**
 * Onboarding tour shown once per device after first login. Stored in
 * AsyncStorage so it survives app restarts but resets on app uninstall.
 * The user state is the trigger — we wait until they're logged in so we
 * don't show the tour before the auth screens.
 */
export function OnboardingTour() {
  const user = useAuth((s) => s.user);
  const hydrated = useAuth((s) => s.hydrated);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const fade = useState(new Animated.Value(0))[0];

  useEffect(() => {
    if (!hydrated || !user) return;
    void (async () => {
      try {
        const seen = await AsyncStorage.getItem(SEEN_KEY);
        if (!seen) {
          setOpen(true);
          Animated.timing(fade, {
            toValue: 1,
            duration: 220,
            useNativeDriver: true,
          }).start();
        }
      } catch {
        /* AsyncStorage failure shouldn't block the app */
      }
    })();
  }, [hydrated, user, fade]);

  const finish = async () => {
    try {
      await AsyncStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* ignore */
    }
    Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setOpen(false);
    });
  };

  const next = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      void finish();
    }
  };

  if (!open) return null;
  const current = STEPS[step]!;
  const isLast = step === STEPS.length - 1;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.backdrop, { opacity: fade }]}>
        <View style={styles.card}>
          <LinearGradient
            colors={current.accent}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconCircle}
          >
            <current.Icon size={36} color={colors.white} />
          </LinearGradient>

          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.body}>{current.body}</Text>

          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
            ))}
          </View>

          <View style={styles.actions}>
            <Pressable onPress={finish} style={styles.skipBtn}>
              <Text style={styles.skipText}>تخطي</Text>
            </Pressable>
            <Pressable
              onPress={next}
              style={({ pressed }) => [styles.nextBtn, pressed && { opacity: 0.85 }]}
            >
              {isLast ? (
                <>
                  <Text style={styles.nextText}>يلا نبدأ</Text>
                  <CheckCircle2 size={18} color={colors.white} />
                </>
              ) : (
                <>
                  <Text style={styles.nextText}>التالي</Text>
                  <ArrowRight
                    size={18}
                    color={colors.white}
                    style={{ transform: [{ scaleX: -1 }] }}
                  />
                </>
              )}
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(36,19,16,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.xl,
    alignItems: 'center',
    width: Math.min(width - spacing.xl * 2, 380),
    ...Platform.select({
      web: { boxShadow: '0 12px 32px rgba(0,0,0,0.2)' },
      default: { elevation: 12 },
    }),
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fontFamilies.headingBlack,
    color: colors.ink,
    fontSize: 22,
    textAlign: 'center',
  },
  body: {
    fontFamily: fontFamilies.body,
    color: colors.text.secondary,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.line2,
  },
  dotActive: {
    backgroundColor: colors.brand.red,
    width: 24,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    alignSelf: 'stretch',
    justifyContent: 'space-between',
  },
  skipBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  skipText: {
    color: colors.text.muted,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand.red,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    minWidth: 130,
    justifyContent: 'center',
  },
  nextText: {
    color: colors.white,
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.sm,
  },
});
