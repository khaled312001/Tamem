import { useQuery } from '@tanstack/react-query';
import { Banknote, CreditCard, Info, Smartphone } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/ScreenHeader';
import { api } from '../lib/api';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

interface Method {
  key: string;
  label: string;
  Icon: LucideIcon;
  desc: string;
  /** Cash always works; the rest exist only while the gateway is switched on. */
  needsGateway: boolean;
}

const METHODS: Method[] = [
  {
    key: 'CASH',
    label: 'الدفع كاش عند الاستلام',
    Icon: Banknote,
    desc: 'ادفع نقداً للسائق عند تسليم طلبك.',
    needsGateway: false,
  },
  {
    key: 'VODAFONE_CASH',
    label: 'فودافون كاش',
    Icon: Smartphone,
    desc: 'حوّل قيمة الطلب من محفظة فودافون كاش الخاصة بك عبر EasyKash مباشرة.',
    needsGateway: true,
  },
  {
    key: 'INSTAPAY',
    label: 'إنستا باي',
    Icon: Smartphone,
    desc: 'حوّل من بنكك مباشرةً عبر InstaPay داخل بوابة EasyKash الآمنة.',
    needsGateway: true,
  },
  {
    key: 'CARD',
    label: 'بطاقة (Visa / MasterCard / Meeza)',
    Icon: CreditCard,
    desc: 'ادفع مباشرةً بأي بطاقة بنكية مصرية أو دولية عبر EasyKash.',
    needsGateway: true,
  },
];

/**
 * The reference page for how paying works. It listed all four methods as
 * «متاح» regardless — while the gateway has never been switched on, so three
 * of the four could not be used by anybody. A customer read this page, chose
 * فودافون كاش at checkout, and then met a driver who wanted cash.
 *
 * It now reads the same `/payments/config` the checkout picker reads, so this
 * page and the order screen can never tell the customer different things.
 */
export function PaymentMethodsScreen() {
  const gateway = useQuery({
    queryKey: ['payments-config'],
    queryFn: async () => {
      const res = await api.raw.get('/payments/config');
      return res.data.data as { online?: boolean };
    },
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  const online = gateway.data?.online === true;

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader
        title="طرق الدفع"
        subtitle={online ? 'اختر طريقة الدفع عند تأكيد كل طلب' : 'كل الطلبات بالدفع عند الاستلام'}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.infoBanner}>
          <Info size={18} color={colors.brand.red} />
          <Text style={styles.infoText}>
            {online
              ? 'الدفع الإلكتروني (فودافون كاش، InstaPay، بطاقة) يتم عبر بوابة EasyKash الآمنة بعد تأكيد سعر الطلب من الإدارة. الكاش يبقى متاحاً دائماً عند الاستلام.'
              : 'كل الطلبات دلوقتي بالدفع كاش عند الاستلام — أياً كان نوع الطلب. الدفع الإلكتروني عبر EasyKash لسه مش مفعّل، وأول ما يتفعّل هيظهر لك تلقائياً هنا وفي شاشة الطلب.'}
          </Text>
        </View>

        {METHODS.map(({ key, label, Icon, desc, needsGateway }) => {
          const available = !needsGateway || online;
          return (
            <View key={key} style={[styles.card, !available && { opacity: 0.55 }]}>
              <View style={styles.cardHead}>
                <View style={styles.iconWrap}>
                  <Icon size={22} color={available ? colors.brand.red : colors.text.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{label}</Text>
                </View>
                <View style={[styles.badge, !available && styles.badgeMuted]}>
                  <Text style={[styles.badgeText, !available && styles.badgeTextMuted]}>
                    {available ? (needsGateway ? 'إلكتروني' : 'متاح') : 'قريباً'}
                  </Text>
                </View>
              </View>
              <Text style={styles.cardDesc}>{desc}</Text>
            </View>
          );
        })}

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
