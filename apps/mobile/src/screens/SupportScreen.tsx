import * as Linking from 'expo-linking';
import { Clock, HelpCircle, Mail, MessageCircle, Phone } from 'lucide-react-native';
import {
  Alert,
  Linking as RNLinking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/ScreenHeader';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

const SUPPORT_PHONE = '+201010254819';
const SUPPORT_EMAIL = 'support@tamem-delivery.com';
const SUPPORT_WHATSAPP = process.env.EXPO_PUBLIC_TAMEM_WHATSAPP ?? SUPPORT_PHONE;

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
  const onWhatsApp = () => {
    const msg = encodeURIComponent('السلام عليكم، عندي استفسار/مشكلة:');
    openURL(`whatsapp://send?phone=${SUPPORT_WHATSAPP.replace('+', '')}&text=${msg}`);
  };
  const onCall = () =>
    openURL(Linking.createURL('') ? `tel:${SUPPORT_PHONE}` : `tel:${SUPPORT_PHONE}`);
  const onEmail = () =>
    openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('استفسار من تطبيق تميم')}`);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader title="الدعم والمساعدة" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.heroTitle}>إزاي نقدر نساعدك؟</Text>
        <Text style={styles.heroSub}>فريق الدعم متاح 7 أيام في الأسبوع</Text>

        {/* Contact channels */}
        <View style={styles.channelRow}>
          <Pressable
            onPress={onWhatsApp}
            style={({ pressed }) => [
              styles.channelCard,
              styles.whatsapp,
              pressed && { opacity: 0.85 },
            ]}
          >
            <MessageCircle size={26} color={colors.white} />
            <Text style={styles.channelLabel}>واتساب</Text>
            <Text style={styles.channelSub}>الأسرع</Text>
          </Pressable>
          <Pressable
            onPress={onCall}
            style={({ pressed }) => [styles.channelCard, styles.call, pressed && { opacity: 0.85 }]}
          >
            <Phone size={26} color={colors.white} />
            <Text style={styles.channelLabel}>اتصال</Text>
            <Text style={styles.channelSub}>24/7</Text>
          </Pressable>
          <Pressable
            onPress={onEmail}
            style={({ pressed }) => [
              styles.channelCard,
              styles.email,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Mail size={26} color={colors.white} />
            <Text style={styles.channelLabel}>إيميل</Text>
            <Text style={styles.channelSub}>24 ساعة</Text>
          </Pressable>
        </View>

        {/* Working hours */}
        <View style={styles.hours}>
          <Clock size={18} color={colors.brand.red} />
          <View style={{ flex: 1 }}>
            <Text style={styles.hoursTitle}>ساعات العمل</Text>
            <Text style={styles.hoursBody}>كل يوم من 8 صباحاً إلى 12 منتصف الليل</Text>
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

        <Text style={styles.footnote}>
          {SUPPORT_PHONE} · {SUPPORT_EMAIL}
        </Text>
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
  channelRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  channelCard: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radii.lg,
    gap: 4,
  },
  whatsapp: { backgroundColor: '#25D366' },
  call: { backgroundColor: colors.brand.red },
  email: { backgroundColor: colors.brand.dark },
  channelLabel: {
    color: colors.white,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
    marginTop: spacing.xs,
  },
  channelSub: { color: 'rgba(255,255,255,0.85)', fontFamily: fontFamilies.body, fontSize: 10 },
  hours: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand.redLight,
    padding: spacing.md,
    borderRadius: radii.lg,
    marginBottom: spacing.lg,
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
});
