import { LinearGradient } from 'expo-linear-gradient';
import type { LucideIcon } from 'lucide-react-native';
import {
  Bike,
  MapPin,
  MapPinned,
  MessageCircle,
  Package,
  ShieldCheck,
  Store,
} from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Animated,
  Easing,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { useAppContent } from '../lib/appContent';
import { useContacts, waLink } from '../lib/contacts';
import type { SignupRole } from '../stores/auth';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

// Made in ChatGPT from the Tamem logo (2026-11-13), 1080×938: the rider
// carries the logo on the box and the jacket, so no separate logo badge.
const HERO = require('../assets/login-hero.jpg');
const HERO_RATIO = 938 / 1080;

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Store, title: 'محلات ومطاعم بلدك', body: 'اطلب من محلات ومطاعم قفط من مكان واحد' },
  { icon: Bike, title: 'توصيل سريع', body: 'جوه قفط في حدود 30 لـ 45 دقيقة' },
  { icon: Package, title: 'شحن ومشاوير', body: 'ابعت أي حاجة لقنا والقرى اللي حوالينا' },
  { icon: MapPinned, title: 'تابع طلبك', body: 'تعرف طلبك فين لحد ما يوصل بابك' },
];

/**
 * The welcome screen, and the app's only way in: Google.
 *
 * It was a red header and a lone button, which said nothing to someone who
 * just installed the app from a friend's link. Now it reads top to bottom:
 * who we are (picture, logo, one line on what Tamem does), the one thing to
 * do (the Google button, in the middle of the screen, with what happens next
 * right under it), then what you get, and a WhatsApp line for anyone stuck.
 *
 * Signing in and making an account are the same tap; a first-time user is
 * created on the server and asked for a phone number once (CollectPhoneScreen).
 * There is no password anywhere, so no password form and no "forgot password".
 */
export function LoginScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { aboutTaglineAr } = useAppContent();
  const { supportWhatsapp } = useContacts();

  // Short enough that the button lands near the middle of a phone screen.
  const heroH = Math.round(Math.min(width * 0.86, height * 0.36));

  // New Google users are customers. The server keeps the role of an existing
  // account, so this never turns a merchant into a customer.
  const resolveGoogleRole = (): Promise<SignupRole | null | undefined> =>
    Promise.resolve('CUSTOMER');

  // The three blocks rise in one after the other. Skipped when the phone asks
  // for less motion.
  const a0 = useRef(new Animated.Value(0)).current;
  const a1 = useRef(new Animated.Value(0)).current;
  const a2 = useRef(new Animated.Value(0)).current;
  const steps = useRef([a0, a1, a2]).current;
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (!alive) return;
        if (reduce) {
          steps.forEach((v) => v.setValue(1));
          return;
        }
        Animated.stagger(
          110,
          steps.map((v) =>
            Animated.timing(v, {
              toValue: 1,
              duration: 420,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ),
        ).start();
      });
    return () => {
      alive = false;
    };
  }, [steps]);
  const rise = (v: Animated.Value) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
  });

  const askForHelp = () => {
    const url = waLink(supportWhatsapp, 'السلام عليكم، محتاج مساعدة في الدخول على تطبيق تميم');
    Linking.openURL(url).catch(() =>
      Alert.alert('واتساب مش موجود', 'كلّمنا على رقم الدعم من صفحة «عن تميم».'),
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.lg }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Who we are */}
        <View
          style={[styles.hero, { height: heroH + insets.top }]}
          accessibilityLabel="مندوب تميم على موتوسيكل"
          accessible
        >
          {/* Explicit size: on web an absolute-fill image keeps its natural
              size and only a corner of the picture shows. Pinned to the top
              and at least as tall as its own ratio, so what gets cut is the
              plain cream at the bottom, never the rider's helmet. It starts
              under the status bar for the same reason. */}
          <Image
            source={HERO}
            style={{
              position: 'absolute',
              top: insets.top,
              left: 0,
              width,
              height: Math.max(heroH, width * HERO_RATIO),
            }}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
          <LinearGradient
            colors={['rgba(252,248,244,0)', 'rgba(252,248,244,0.85)', colors.surface]}
            locations={[0, 0.7, 1]}
            style={styles.heroFade}
          />
        </View>

        <Animated.View style={[styles.welcome, rise(a0)]}>
          <View style={styles.placePill}>
            <MapPin size={13} color={colors.brand.red} />
            <Text style={styles.placeText} numberOfLines={1}>
              {aboutTaglineAr}
            </Text>
          </View>
          <Text style={styles.title} accessibilityRole="header">
            أهلاً بيك في تميم
          </Text>
          <Text style={styles.subtitle}>
            اطلب من محلات ومطاعم بلدك، أو ابعت أي حاجة لأي مكان، والمندوب يوصّلها لحد عندك.
          </Text>
        </Animated.View>

        {/* The one thing to do */}
        <Animated.View style={[styles.cta, rise(a1)]}>
          <GoogleSignInButton
            large
            label="ادخل بحساب جوجل"
            onResolveRole={resolveGoogleRole}
            onError={(msg) => Alert.alert('مقدرناش ندخلك', msg)}
          />
          <View style={styles.trust}>
            <ShieldCheck size={15} color={colors.success} />
            <Text style={styles.trustText}>من غير كلمة سر. أول مرة؟ هيتعملك حساب على طول.</Text>
          </View>
        </Animated.View>

        {/* What you get */}
        <Animated.View style={[styles.features, rise(a2)]}>
          <Text style={styles.sectionTitle}>إيه اللي تقدر تعمله مع تميم</Text>
          <View style={styles.grid}>
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <View key={title} style={styles.tile}>
                <View style={styles.tileIcon}>
                  <Icon size={20} color={colors.brand.red} />
                </View>
                <Text style={styles.tileTitle}>{title}</Text>
                <Text style={styles.tileBody}>{body}</Text>
              </View>
            ))}
          </View>

          <Pressable
            onPress={askForHelp}
            style={({ pressed }) => [styles.help, pressed && { opacity: 0.7 }]}
            accessibilityRole="link"
            hitSlop={8}
          >
            <MessageCircle size={15} color={colors.text.muted} />
            <Text style={styles.helpText}>
              محتاج مساعدة؟ <Text style={styles.helpLink}>كلّمنا على واتساب</Text>
            </Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { flexGrow: 1 },
  // The sky at the top edge of the picture, so the strip under the status
  // bar reads as part of it.
  hero: { width: '100%', overflow: 'hidden', backgroundColor: '#E2C4C1' },
  heroFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '38%' },
  welcome: { alignItems: 'center', paddingHorizontal: spacing.xl, marginTop: -spacing.lg },
  placePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.brand.redLight,
    maxWidth: '100%',
  },
  placeText: { color: colors.brand.red, fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.xs },
  title: {
    marginTop: spacing.sm,
    color: colors.ink,
    fontFamily: fontFamilies.headingBlack,
    fontSize: 30,
    lineHeight: 44,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 4,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    lineHeight: 26,
    textAlign: 'center',
  },
  cta: {
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xl,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  trust: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.md,
  },
  trustText: {
    color: colors.text.muted,
    fontFamily: fontFamilies.bodyMedium,
    fontSize: fontSizes.xs,
    textAlign: 'center',
    flexShrink: 1,
  },
  features: { paddingHorizontal: spacing.lg, marginTop: spacing.xxl },
  sectionTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.md,
    textAlign: 'right',
    marginBottom: spacing.md,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    flexBasis: '48%',
    flexGrow: 1,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tileIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.redLight,
    marginBottom: spacing.sm,
  },
  tileTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
    textAlign: 'right',
  },
  tileBody: {
    marginTop: 2,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    lineHeight: 19,
    textAlign: 'right',
  },
  help: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.xl,
  },
  helpText: { color: colors.text.muted, fontFamily: fontFamilies.body, fontSize: fontSizes.xs },
  helpLink: {
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyBold,
    textDecorationLine: 'underline',
  },
});
