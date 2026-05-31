import { Banknote, Copy, CreditCard, Info, Smartphone } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/ScreenHeader';
import { copyToClipboard } from '../lib/clipboard';
import { showToast } from '../lib/toast';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

const VODAFONE_CASH_NUMBER = '01010254819';
const INSTAPAY_HANDLE = 'tamem@instapay';

interface Method {
  key: string;
  label: string;
  badge: string;
  Icon: LucideIcon;
  desc: string;
  available: boolean;
  /** Optional value to expose with a copy button (e.g. wallet number). */
  copyLabel?: string;
  copyValue?: string;
}

const METHODS: Method[] = [
  {
    key: 'CASH',
    label: 'الدفع كاش عند الاستلام',
    badge: 'متاح',
    Icon: Banknote,
    desc: 'ادفع نقداً للسائق عند تسليم طلبك. أكثر طريقة استخداماً.',
    available: true,
  },
  {
    key: 'VODAFONE_CASH',
    label: 'فودافون كاش',
    badge: 'متاح',
    Icon: Smartphone,
    desc: 'حوّل قيمة الطلب على محفظة تَميم وارفع لقطة شاشة للإيصال عند تأكيد الطلب.',
    available: true,
    copyLabel: 'رقم محفظة تَميم',
    copyValue: VODAFONE_CASH_NUMBER,
  },
  {
    key: 'INSTAPAY',
    label: 'إنستا باي',
    badge: 'متاح',
    Icon: Smartphone,
    desc: 'حوّل لحساب تَميم على إنستا باي وأرفق إثبات التحويل.',
    available: true,
    copyLabel: 'حساب إنستا باي',
    copyValue: INSTAPAY_HANDLE,
  },
  {
    key: 'CARD',
    label: 'بطاقة بنكية (Visa / Mastercard)',
    badge: 'قريباً',
    Icon: CreditCard,
    desc: 'الدفع المباشر بالبطاقة هيكون متاح في الإصدار القادم بإذن الله.',
    available: false,
  },
];

export function PaymentMethodsScreen() {
  const onCopy = async (label: string, value: string) => {
    const ok = await copyToClipboard(value);
    showToast({
      title: ok ? `${label} ✓` : value,
      message: ok ? 'تم نسخ القيمة' : 'انسخ القيمة يدوياً من فوق',
      tone: ok ? 'success' : 'info',
    });
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader title="طرق الدفع" subtitle="طرق الدفع المتاحة عند تأكيد الطلب" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.infoBanner}>
          <Info size={18} color={colors.brand.red} />
          <Text style={styles.infoText}>
            بتختار طريقة الدفع عند تأكيد كل طلب. تقدر تنسخ أرقام التحويل من هنا قبل ما تطلب.
          </Text>
        </View>

        {METHODS.map(({ key, label, badge, Icon, desc, available, copyLabel, copyValue }) => (
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

            {copyValue && copyLabel ? (
              <Pressable
                onPress={() => void onCopy(copyLabel, copyValue)}
                style={({ pressed }) => [styles.copyRow, pressed && { opacity: 0.85 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.copyLabel}>{copyLabel}</Text>
                  <Text style={styles.copyValue}>{copyValue}</Text>
                </View>
                <View style={styles.copyBtn}>
                  <Copy size={14} color={colors.brand.red} />
                  <Text style={styles.copyBtnText}>نسخ</Text>
                </View>
              </Pressable>
            ) : null}
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
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  copyLabel: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: 10,
  },
  copyValue: {
    fontFamily: fontFamilies.headingBold,
    color: colors.ink,
    fontSize: fontSizes.sm,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brand.redLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  copyBtnText: {
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xs,
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
