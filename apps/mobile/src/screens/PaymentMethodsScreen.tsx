import { Banknote, CreditCard, Info, Smartphone } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/ScreenHeader';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

interface Method {
  key: string;
  label: string;
  badge: string;
  Icon: LucideIcon;
  desc: string;
  available: boolean;
}

const METHODS: Method[] = [
  {
    key: 'CASH',
    label: 'الدفع كاش عند الاستلام',
    badge: 'متاح',
    Icon: Banknote,
    desc: 'ادفع نقداً للسائق عند تسليم طلبك. الطريقة الأكثر استخداماً.',
    available: true,
  },
  {
    key: 'VODAFONE_CASH',
    label: 'فودافون كاش',
    badge: 'إلكتروني',
    Icon: Smartphone,
    desc: 'حوّل قيمة الطلب من محفظة فودافون كاش الخاصة بك عبر EasyKash مباشرة.',
    available: true,
  },
  {
    key: 'INSTAPAY',
    label: 'إنستا باي',
    badge: 'إلكتروني',
    Icon: Smartphone,
    desc: 'حوّل من بنكك مباشرةً عبر InstaPay داخل بوابة EasyKash الآمنة.',
    available: true,
  },
  {
    key: 'CARD',
    label: 'بطاقة (Visa / MasterCard / Meeza)',
    badge: 'إلكتروني',
    Icon: CreditCard,
    desc: 'ادفع مباشرةً بأي بطاقة بنكية مصرية أو دولية عبر EasyKash.',
    available: true,
  },
];

export function PaymentMethodsScreen() {
  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader title="طرق الدفع" subtitle="اختر طريقة الدفع عند تأكيد كل طلب" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.infoBanner}>
          <Info size={18} color={colors.brand.red} />
          <Text style={styles.infoText}>
            الدفع الإلكتروني (فودافون كاش، InstaPay، بطاقة) يتم عبر بوابة EasyKash الآمنة بعد تأكيد
            سعر الطلب من الإدارة. الكاش يبقى متاحاً دائماً عند الاستلام.
          </Text>
        </View>

        {METHODS.map(({ key, label, badge, Icon, desc, available }) => (
          <View key={key} style={[styles.card, !available && { opacity: 0.55 }]}>
            <View style={styles.cardHead}>
              <View style={styles.iconWrap}>
                <Icon size={22} color={colors.brand.red} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{label}</Text>
              </View>
              <View style={[styles.badge, !available && styles.badgeMuted]}>
                <Text style={[styles.badgeText, !available && styles.badgeTextMuted]}>{badge}</Text>
              </View>
            </View>
            <Text style={styles.cardDesc}>{desc}</Text>
          </View>
        ))}

        <Text style={styles.footnote}>
          ⓘ لو واجهت أي مشكلة في الدفع، تواصل مع الدعم من شاشة "حسابي ← الدعم والمساعدة".
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand.redLight,
    padding: spacing.md,
    borderRadius: radii.lg,
    marginBottom: spacing.lg,
  },
  infoText: {
    flex: 1,
    color: colors.ink,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontFamily: fontFamilies.bodyExtraBold, color: colors.ink, fontSize: fontSizes.sm },
  badge: {
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  badgeMuted: { backgroundColor: '#F3F3F3' },
  badgeText: { color: colors.success, fontSize: 10, fontFamily: fontFamilies.bodyExtraBold },
  badgeTextMuted: { color: colors.text.muted },
  cardDesc: {
    marginTop: spacing.sm,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    lineHeight: 20,
  },
  footnote: {
    marginTop: spacing.md,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    textAlign: 'center',
    lineHeight: 20,
  },
});
