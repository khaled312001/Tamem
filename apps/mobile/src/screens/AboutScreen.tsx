import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Award,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Shield,
  Sparkles,
  Truck,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import {
  Alert,
  Image,
  Linking as RNLinking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/ScreenHeader';
import {
  colors,
  fontFamilies,
  fontSizes,
  gradients,
  radii,
  shadows,
  spacing,
} from '../theme/tokens';

const TAMEM_PHONE = '+201010254819';
const TAMEM_EMAIL = 'info@tamem-delivery.com';
const TAMEM_SITE = 'https://tamem-delivery.com';
const TAMEM_WHATSAPP = process.env.EXPO_PUBLIC_TAMEM_WHATSAPP ?? TAMEM_PHONE;

interface Pillar {
  Icon: LucideIcon;
  title: string;
  body: string;
}

const PILLARS: Pillar[] = [
  {
    Icon: Truck,
    title: 'سرعة موثوقة',
    body: 'توصيل داخل قفط خلال 30 دقيقة، وشحن بين المحافظات في يومه. نختار أقرب سائق متاح لطلبك تلقائياً.',
  },
  {
    Icon: Shield,
    title: 'أمان وضمان',
    body: 'كل طلب مؤمَّن بالكامل. السائقون موثّقون بهويات وطنية، وفي حالة أي مشكلة الإدارة جاهزة على واتساب.',
  },
  {
    Icon: Award,
    title: 'مكافآت الولاء',
    body: 'احصل على 5% من قيمة كل طلب في محفظتك. استخدمها في طلباتك القادمة، أو شارك كود الإحالة مع أصدقائك.',
  },
  {
    Icon: Sparkles,
    title: 'تجربة عربية أصيلة',
    body: 'صُمِّم التطبيق من الصفر للمستخدم العربي — لا ترجمة، لا اقتباس. واجهة سلسة وردود إدارة بلهجتك.',
  },
];

async function openURL(url: string): Promise<void> {
  try {
    const supported = await RNLinking.canOpenURL(url);
    if (!supported) {
      Alert.alert('غير متاح', 'هذا التطبيق غير مثبت على جهازك');
      return;
    }
    await RNLinking.openURL(url);
  } catch {
    Alert.alert('خطأ', 'تعذّر فتح الرابط');
  }
}

export function AboutScreen() {
  const onWhatsApp = () => {
    const msg = encodeURIComponent('السلام عليكم، عاوز أسأل عن تَميم:');
    void openURL(`https://wa.me/${TAMEM_WHATSAPP.replace(/\D/g, '')}?text=${msg}`);
  };
  const onCall = () => void openURL(`tel:${TAMEM_PHONE}`);
  const onEmail = () =>
    void openURL(`mailto:${TAMEM_EMAIL}?subject=${encodeURIComponent('استفسار من تطبيق تميم')}`);
  const onSite = () => void Linking.openURL(TAMEM_SITE);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader title="عن تَميم" subtitle="منصة التوصيل والشحن في قفط" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, shadows.brand]}
        >
          <View style={styles.heroIconWrap}>
            <Truck size={36} color={colors.white} />
          </View>
          <Text style={styles.heroTitle}>تَميم للتوصيل والشحن</Text>
          <Text style={styles.heroSub}>
            منصة مصرية صعيدية بتجمع كل احتياجات التوصيل في تطبيق واحد — من البقالة وحتى الشحنات بين
            المحافظات.
          </Text>
        </LinearGradient>

        {/* Mission */}
        <View style={[styles.card, shadows.sm]}>
          <Text style={styles.sectionLabel}>مهمتنا</Text>
          <Text style={styles.missionText}>
            نوصّلك بسرعة وأمان، بأسعار حقيقية، وخدمة عميل بتفهم لهجتك. تَميم مش بس تطبيق — هي شبكة
            سائقين ومتاجر وعمال محليين بنخدم بيهم مجتمعنا في قفط وقنا.
          </Text>
        </View>

        {/* Pillars */}
        <Text style={styles.sectionTitle}>ليه تَميم؟</Text>
        <View style={styles.pillarsGrid}>
          {PILLARS.map((p) => (
            <View key={p.title} style={[styles.pillarCard, shadows.sm]}>
              <View style={styles.pillarIconWrap}>
                <p.Icon size={20} color={colors.brand.red} />
              </View>
              <Text style={styles.pillarTitle}>{p.title}</Text>
              <Text style={styles.pillarBody}>{p.body}</Text>
            </View>
          ))}
        </View>

        {/* Stats */}
        <View style={[styles.statsCard, shadows.md]}>
          <View style={styles.statCol}>
            <Text style={styles.statNum}>30</Text>
            <Text style={styles.statLabel}>دقيقة متوسط التوصيل</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCol}>
            <Text style={styles.statNum}>24/7</Text>
            <Text style={styles.statLabel}>دعم على واتساب</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCol}>
            <Text style={styles.statNum}>5%</Text>
            <Text style={styles.statLabel}>كاش باك على كل طلب</Text>
          </View>
        </View>

        {/* Contact */}
        <Text style={styles.sectionTitle}>تواصل معنا</Text>
        <View style={styles.contactRow}>
          <ContactTile
            Icon={MessageCircle}
            label="واتساب"
            sub="الأسرع"
            color="#25D366"
            onPress={onWhatsApp}
          />
          <ContactTile
            Icon={Phone}
            label="اتصال"
            sub="24/7"
            color={colors.brand.red}
            onPress={onCall}
          />
          <ContactTile
            Icon={Mail}
            label="إيميل"
            sub="24 ساعة"
            color={colors.brand.dark}
            onPress={onEmail}
          />
        </View>

        {/* Address */}
        <View style={[styles.infoRow, shadows.sm]}>
          <View style={styles.infoIcon}>
            <MapPin size={16} color={colors.brand.red} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>المقر الرئيسي</Text>
            <Text style={styles.infoBody}>مدينة قفط — قنا، صعيد مصر</Text>
          </View>
        </View>
        <Pressable
          onPress={onSite}
          style={({ pressed }) => [styles.infoRow, shadows.sm, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.infoIcon}>
            <Globe size={16} color={colors.brand.red} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>الموقع الإلكتروني</Text>
            <Text style={styles.infoLink}>{TAMEM_SITE.replace('https://', '')}</Text>
          </View>
        </Pressable>

        {/* Developer credit */}
        <Pressable
          onPress={() => void Linking.openURL('http://barmagly.tech/')}
          style={({ pressed }) => [styles.devCard, shadows.md, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.devLogoWrap}>
            <Image
              source={require('../assets/barmagly-logo.jpg')}
              style={styles.devLogo}
              resizeMode="cover"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.devLabel}>تطوير وتنفيذ</Text>
            <Text style={styles.devName}>شركة برمجلي</Text>
            <Text style={styles.devLink}>barmagly.tech</Text>
          </View>
        </Pressable>

        <Text style={styles.version}>الإصدار 0.1.0 — تَميم للتوصيل © 2026</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function ContactTile({
  Icon,
  label,
  sub,
  color,
  onPress,
}: {
  Icon: LucideIcon;
  label: string;
  sub: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.contactTile,
        { backgroundColor: color },
        shadows.sm,
        pressed && { opacity: 0.85 },
      ]}
    >
      <Icon size={24} color={colors.white} />
      <Text style={styles.contactLabel}>{label}</Text>
      <Text style={styles.contactSub}>{sub}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  // Hero
  hero: {
    borderRadius: radii.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
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
    fontFamily: fontFamilies.headingBlack,
    fontSize: fontSizes.xl,
    marginBottom: 6,
  },
  heroSub: {
    color: 'rgba(255,255,255,0.92)',
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    lineHeight: 22,
  },
  // Mission
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.headingBlack,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  missionText: {
    fontFamily: fontFamilies.body,
    color: colors.ink,
    fontSize: fontSizes.sm,
    lineHeight: 24,
  },
  // Section titles
  sectionTitle: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.headingBold,
    color: colors.ink,
    marginBottom: spacing.md,
    marginTop: spacing.md,
  },
  // Pillars
  pillarsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  pillarCard: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
  },
  pillarIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  pillarTitle: {
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
    fontSize: fontSizes.sm,
    marginBottom: 4,
  },
  pillarBody: {
    fontFamily: fontFamilies.body,
    color: colors.text.secondary,
    fontSize: fontSizes.xs,
    lineHeight: 20,
  },
  // Stats card
  statsCard: {
    flexDirection: 'row',
    backgroundColor: colors.brand.dark,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  statCol: { flex: 1, alignItems: 'center' },
  statNum: {
    color: colors.brand.gold,
    fontFamily: fontFamilies.headingBlack,
    fontSize: fontSizes.xl,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 16,
  },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.18)' },
  // Contact tiles
  contactRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  contactTile: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    alignItems: 'center',
    gap: 4,
  },
  contactLabel: {
    color: colors.white,
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.sm,
    marginTop: 4,
  },
  contactSub: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fontFamilies.body,
    fontSize: 10,
  },
  // Info rows
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTitle: {
    fontFamily: fontFamilies.bodyBold,
    color: colors.text.muted,
    fontSize: fontSizes.xs,
  },
  infoBody: {
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
    fontSize: fontSizes.sm,
    marginTop: 2,
  },
  infoLink: {
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.brand.red,
    fontSize: fontSizes.sm,
    marginTop: 2,
  },
  // Dev card
  devCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.brand.dark,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  devLogoWrap: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  devLogo: { width: '100%', height: '100%' },
  devLabel: { color: 'rgba(255,255,255,0.65)', fontFamily: fontFamilies.body, fontSize: 10 },
  devName: { color: colors.white, fontFamily: fontFamilies.headingBlack, fontSize: fontSizes.md },
  devLink: {
    color: colors.brand.gold,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  version: {
    textAlign: 'center',
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    fontSize: 10,
    marginTop: spacing.lg,
  },
});
