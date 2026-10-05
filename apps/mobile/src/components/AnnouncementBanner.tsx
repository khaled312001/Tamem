import { Info, TriangleAlert } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { useAppContent } from '../lib/appContent';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

/**
 * شريط إعلان من الإدارة أعلى الصفحة الرئيسية.
 *
 * ده المكان اللي الإدارة بتقول فيه حاجة عاجلة — «خدمة الشحن متوقفة النهارده»،
 * «عطلة العيد» — من غير نسخة جديدة على المتجر. بييجي من GET /app-content
 * وبيتحكم فيه من صفحة «محتوى التطبيق» في اللوحة، ومابيرسمش حاجة وهو مقفول.
 *
 * مش نفس PromoBanner: ده تشغيلي ومؤقت، والتاني تسويقي ومربوط بكوبون.
 */
export function AnnouncementBanner() {
  const { announcement } = useAppContent();
  if (!announcement.enabled || !announcement.titleAr) return null;

  const warn = announcement.variant === 'warn';
  const Icon = warn ? TriangleAlert : Info;
  const accent = warn ? colors.brand.red : colors.brand.gold;

  return (
    <View
      style={[
        styles.card,
        { borderStartColor: accent, backgroundColor: warn ? '#FDECEA' : '#FFF7E8' },
      ]}
      accessibilityRole="alert"
    >
      <Icon size={18} color={accent} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{announcement.titleAr}</Text>
        {!!announcement.bodyAr && <Text style={styles.body}>{announcement.bodyAr}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radii.lg,
    // Start, not left — the app is RTL, so the accent sits on the right.
    borderStartWidth: 4,
  },
  title: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
    color: colors.text.primary,
    textAlign: 'right',
  },
  body: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    color: colors.text.secondary,
    textAlign: 'right',
    marginTop: 2,
    lineHeight: 18,
  },
});
