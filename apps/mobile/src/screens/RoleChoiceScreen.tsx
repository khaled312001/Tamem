import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Store, Truck, User } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { AuthStackParamList } from '../navigation/AuthStack';
import {
  colors,
  fontFamilies,
  fontSizes,
  gradients,
  radii,
  shadows,
  spacing,
} from '../theme/tokens';

type NavProp = NativeStackNavigationProp<AuthStackParamList, 'RoleChoice'>;

type RoleKey = 'CUSTOMER' | 'MERCHANT';

interface RoleCardConfig {
  key: RoleKey;
  label: string;
  description: string;
  Icon: typeof User;
}

const ROLES: RoleCardConfig[] = [
  {
    key: 'CUSTOMER',
    label: 'عميل',
    description: 'اطلب من متاجرك المفضلة وتابع توصيل طلباتك لحظة بلحظة.',
    Icon: User,
  },
  {
    key: 'MERCHANT',
    label: 'تاجر',
    description: 'سجّل دخول حساب متجرك لإدارة المنتجات والطلبات الواردة.',
    Icon: Store,
  },
];

export function RoleChoiceScreen() {
  const navigation = useNavigation<NavProp>();
  const [activeRole, setActiveRole] = useState<RoleKey | null>(null);

  const handleSelect = (role: RoleKey) => {
    setActiveRole(role);
    navigation.navigate('Login', { initialRole: role });
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <LinearGradient
        colors={gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroLogoCircle}>
          <Truck size={28} color={colors.white} />
        </View>
        <Text style={styles.heroTitle}>مرحباً بك في تميم</Text>
        <Text style={styles.heroSubtitle}>اختر نوع حسابك للمتابعة إلى تسجيل الدخول</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>من فضلك اختر دورك</Text>

        {ROLES.map(({ key, label, description, Icon }) => {
          const isActive = activeRole === key;
          return (
            <Pressable
              key={key}
              onPress={() => handleSelect(key)}
              style={({ pressed }) => [
                styles.card,
                shadows.sm,
                (pressed || isActive) && styles.cardActive,
              ]}
            >
              <View style={styles.cardIconWrap}>
                <Icon size={32} color={colors.brand.red} />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardLabel}>{label}</Text>
                <Text style={styles.cardDescription}>{description}</Text>
              </View>
              <ChevronLeft size={20} color={colors.brand.red} />
            </Pressable>
          );
        })}

        <Text style={styles.footnote}>
          تسجيل الدخول للتجار يستخدم نفس بيانات الحساب — اختر "تاجر" إذا كان حسابك مفعّل كحساب متجر.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  hero: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    borderBottomLeftRadius: radii.xxl,
    borderBottomRightRadius: radii.xxl,
    alignItems: 'center',
  },
  heroLogoCircle: {
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
    fontSize: fontSizes.xxl,
    fontFamily: fontFamilies.headingBlack,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.body,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 22,
    paddingHorizontal: spacing.md,
  },
  scroll: {
    padding: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  sectionLabel: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
    color: colors.text.secondary,
    marginBottom: spacing.md,
    marginTop: -spacing.xl,
    paddingTop: spacing.lg,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    borderWidth: 2,
    borderColor: colors.line,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardActive: {
    borderColor: colors.brand.red,
    backgroundColor: colors.brand.redLight,
  },
  cardIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radii.lg,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
  },
  cardLabel: {
    fontFamily: fontFamilies.headingBlack,
    fontSize: fontSizes.lg,
    color: colors.ink,
    marginBottom: 4,
  },
  cardDescription: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  footnote: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 18,
    paddingHorizontal: spacing.md,
  },
});
