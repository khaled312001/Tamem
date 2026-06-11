import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronRight, Store } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { AuthStackParamList } from '../navigation/AuthStack';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

type NavProp = NativeStackNavigationProp<AuthStackParamList, 'MerchantSignup'>;

export function MerchantSignupScreen() {
  const navigation = useNavigation<NavProp>();

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
        >
          <ChevronRight size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>تسجيل تاجر</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Store size={48} color={colors.brand.red} />
        </View>
        <Text style={styles.title}>قريباً</Text>
        <Text style={styles.subtitle}>
          صفحة التسجيل كتاجر قيد التطوير. سيتم تفعيلها قريباً لإتاحة إنشاء حساب متجر جديد.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  headerTitle: {
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.lg,
    color: colors.ink,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  iconWrap: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontFamily: fontFamilies.headingBlack,
    fontSize: fontSizes.xxl,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
