import { Clock, HelpCircle, Mail, MapPin, MessageCircle, Phone } from 'lucide-react-native';
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
import { DEFAULT_CONTACTS, TAMEM_ADDRESS_AR } from '../config/contact';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

const SUPPORT_EMAIL = 'support@tamem-delivery.com';

async function openURL(url: string) {
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

const FAQS = [
  {
    q: 'كم يستغرق الطلب للوصول؟',
    a: 'الطلبات الداخل قفط بتوصل خلال 30-45 دقيقة. الشحن بين المناطق ياخد من 2-6 ساعات حسب المسافة.',
  },
  {
    q: 'إيه طرق الدفع المتاحة؟',
    a: 'كاش عند الاستلام، فودافون كاش، إنستا باي. الدفع بالبطاقة قريباً.',
  },
  {
    q: 'هل أقدر ألغي الطلب؟',
    a: 'تقدر تلغي الطلب طول ما لسه ما اتأكدش من السائق. بعد كده تواصل مع الإدارة.',
  },
  {
    q: 'إزاي أتابع طلبي؟',
    a: 'افتح "طلباتي" واضغط على الطلب — هتشوف الحالة الحالية وكل التحديثات.',
  },
];

export function SupportScreen() {
  const onEmail = () =>
    openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('استفسار من تطبيق تميم')}`);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader title="الدعم والمساعدة" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.heroTitle}>إزاي نقدر نساعدك؟</Text>
        <Text style={styles.heroSub}>فريق تميم متاح يومياً من 10 ص حتى 1 بعد منتصف الليل</Text>

        {/* Per-service direct lines — each card opens WhatsApp on tap with a
            pre-filled message; the inline phone number is a tel: link for
            customers who prefer to call instead. */}
        {DEFAULT_CONTACTS.map((c) => (
          <View key={c.key} style={styles.lineCard}>
            <View style={styles.lineHead}>
              <View
                style={[styles.lineIcon, c.key === 'support' && { backgroundColor: '#F2A93B' }]}
              >
                <Phone size={18} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.lineLabel}>{c.labelAr}</Text>
                <Text style={styles.lineDesc}>{c.descAr}</Text>
              </View>
            </View>
            <View style={styles.lineActions}>
              <Pressable
                onPress={() => openURL(c.whatsapp)}
                style={({ pressed }) => [styles.waBtn, pressed && { opacity: 0.85 }]}
              >
                <MessageCircle size={16} color={colors.white} />
                <Text style={styles.waBtnText}>واتساب</Text>
              </Pressable>
              <Pressable
                onPress={() => openURL(`tel:${c.phone}`)}
                style={({ pressed }) => [styles.callBtn, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.callBtnText}>{c.phone}</Text>
              </Pressable>
            </View>
          </View>
        ))}

        {/* HQ address */}
        <View style={styles.addressCard}>
          <MapPin size={18} color={colors.brand.red} />
          <View style={{ flex: 1 }}>
            <Text style={styles.hoursTitle}>{TAMEM_ADDRESS_AR}</Text>
            <Pressable onPress={onEmail}>
              <Text style={styles.addressEmail}>
                <Mail size={12} color={colors.text.muted} /> {SUPPORT_EMAIL}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Working hours */}
        <View style={styles.addressCard}>
          <Clock size={18} color={colors.brand.red} />
          <View style={{ flex: 1 }}>
            <Text style={styles.hoursTitle}>ساعات العمل</Text>
            <Text style={styles.hoursBody}>كل يوم من 10 صباحاً إلى 1 بعد منتصف الليل</Text>
          </View>
        </View>

        {/* FAQs */}
        <Text style={styles.sectionTitle}>الأسئلة الشائعة</Text>
        {FAQS.map(({ q, a }) => (
          <View key={q} style={styles.faqCard}>
            <View style={styles.faqHead}>
              <HelpCircle size={16} color={colors.brand.red} />
              <Text style={styles.faqQ}>{q}</Text>
            </View>
            <Text style={styles.faqA}>{a}</Text>
          </View>
        ))}

        <Text style={styles.footnote}>{SUPPORT_EMAIL}</Text>

        {/* Developer credit — شركة برمجلي */}
        <Pressable
          onPress={() => openURL('http://barmagly.tech/')}
          style={({ pressed }) => [styles.devCard, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.devLogo}>
            <Image
              source={require('../assets/barmagly-logo.jpg')}
              style={styles.devLogoImg}
              resizeMode="cover"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.devLabel}>تطوير وتنفيذ</Text>
            <Text style={styles.devName}>شركة برمجلي</Text>
            <Text style={styles.devLink}>barmagly.tech · +201010254819</Text>
          </View>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  heroTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.headingBold,
    color: colors.ink,
    textAlign: 'center',
  },
  heroSub: {
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: spacing.lg,
  },
  lineCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
  },
  lineHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  lineIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: colors.brand.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineLabel: { fontFamily: fontFamilies.bodyExtraBold, color: colors.ink, fontSize: fontSizes.sm },
  lineDesc: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  lineActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  waBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1A9F6E',
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  waBtnText: {
    color: colors.white,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xs,
  },
  callBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.brand.red,
  },
  callBtnText: { color: colors.brand.red, fontFamily: fontFamilies.body, fontSize: fontSizes.xs },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand.redLight,
    padding: spacing.md,
    borderRadius: radii.lg,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  addressEmail: {
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  hoursTitle: { fontFamily: fontFamilies.bodyExtraBold, color: colors.ink, fontSize: fontSizes.sm },
  hoursBody: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  sectionTitle: {
    fontFamily: fontFamilies.headingBlack,
    color: colors.ink,
    fontSize: fontSizes.md,
    marginBottom: spacing.sm,
  },
  faqCard: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  faqHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  faqQ: {
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
    fontSize: fontSizes.sm,
    flex: 1,
  },
  faqA: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.xs,
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  footnote: {
    marginTop: spacing.lg,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    textAlign: 'center',
  },
  devCard: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.brand.dark,
    padding: spacing.md,
    borderRadius: radii.lg,
  },
  devLogo: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  devLogoImg: { width: '100%', height: '100%' },
  devLabel: { color: 'rgba(255,255,255,0.65)', fontFamily: fontFamilies.body, fontSize: 10 },
  devName: { color: colors.white, fontFamily: fontFamilies.headingBlack, fontSize: fontSizes.md },
  devLink: {
    color: colors.brand.gold,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
});
