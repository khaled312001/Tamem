import { Bell } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientHeader } from '../components/GradientHeader';
import { colors, fontFamilies, fontSizes, spacing } from '../theme/tokens';

export function NotificationsScreen() {
  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <GradientHeader greeting="الإشعارات" location="تنبيهات طلباتك والعروض" />

      <View style={styles.empty}>
        <Bell size={48} color={colors.text.muted} />
        <Text style={styles.emptyTitle}>لا توجد إشعارات بعد</Text>
        <Text style={styles.emptySub}>
          ستظهر هنا تنبيهات الطلبات الجديدة، تحديثات الحالة، والعروض.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  emptyTitle: { fontSize: fontSizes.md, fontFamily: fontFamilies.bodyExtraBold, color: colors.ink },
  emptySub: {
    fontSize: fontSizes.sm,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    textAlign: 'center',
    lineHeight: 22,
  },
});
