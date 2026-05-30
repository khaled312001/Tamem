import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  ChevronLeft,
  HeadphonesIcon,
  LogOut,
  MapPin,
  Star,
  User,
  Wallet,
} from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientHeader } from '../components/GradientHeader';
import { api } from '../lib/api';
import type { ProfileStackParamList } from '../navigation/ProfileStack';
import { useAuth } from '../stores/auth';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

type Nav = NativeStackNavigationProp<ProfileStackParamList, 'Profile'>;

interface RowProps {
  label: string;
  Icon: typeof User;
  onPress?: () => void;
  trailing?: React.ReactNode;
}

function Row({ label, Icon, onPress, trailing }: RowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.rowIcon}>
        <Icon size={18} color={colors.brand.red} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      {trailing ?? <ChevronLeft size={16} color={colors.text.muted} />}
    </Pressable>
  );
}

interface OrdersCountResponse {
  total: number;
}

export function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const user = useAuth((s) => s.user);
  const clear = useAuth((s) => s.clear);
  const [notificationsOn, setNotificationsOn] = useState(true);

  const { data: orderCount } = useQuery<OrdersCountResponse>({
    queryKey: ['my-orders-count'],
    queryFn: async () => {
      const res = await api.raw.get('/orders/mine', { params: { pageSize: 1 } });
      return { total: res.data.meta?.total ?? res.data.data?.length ?? 0 };
    },
  });

  const onLogout = () => {
    Alert.alert('تأكيد', 'هل تريد تسجيل الخروج؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'خروج', style: 'destructive', onPress: () => void clear() },
    ]);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <GradientHeader greeting="حسابي" location={user?.phone ?? ''} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase() ?? 'ت'}</Text>
          </View>
          <Text style={styles.userName}>{user?.name ?? 'مستخدم'}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>عميل مميز</Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{orderCount?.total ?? 0}</Text>
              <Text style={styles.statLabel}>طلباتي</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Star size={14} color={colors.brand.gold} fill={colors.brand.gold} />
              <Text style={styles.statValue}>5.0</Text>
              <Text style={styles.statLabel}>التقييم</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>1</Text>
              <Text style={styles.statLabel}>عناوين</Text>
            </View>
          </View>
        </View>

        {/* Account */}
        <Text style={styles.sectionTitle}>الحساب</Text>
        <View style={styles.group}>
          <Row
            label="تعديل البيانات الشخصية"
            Icon={User}
            onPress={() => navigation.navigate('EditProfile')}
          />
          <Row
            label="عناويني المحفوظة"
            Icon={MapPin}
            onPress={() => navigation.navigate('SavedAddresses')}
          />
          <Row label="محفظتي" Icon={Wallet} onPress={() => navigation.navigate('Wallet')} />
          <Row
            label="طرق الدفع"
            Icon={Wallet}
            onPress={() => navigation.navigate('PaymentMethods')}
          />
        </View>

        {/* Preferences */}
        <Text style={styles.sectionTitle}>الإعدادات</Text>
        <View style={styles.group}>
          <Row
            label="الإشعارات"
            Icon={Bell}
            trailing={
              <Switch
                trackColor={{ false: colors.line2, true: colors.brand.red }}
                thumbColor={colors.white}
                value={notificationsOn}
                onValueChange={setNotificationsOn}
              />
            }
          />
          <Row
            label="الدعم والمساعدة"
            Icon={HeadphonesIcon}
            onPress={() => navigation.navigate('Support')}
          />
        </View>

        {/* Logout */}
        <Pressable
          onPress={onLogout}
          style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.85 }]}
        >
          <LogOut size={18} color={colors.brand.red} />
          <Text style={styles.logoutText}>تسجيل الخروج</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  profileCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.lg,
    alignItems: 'center',
    borderColor: colors.line,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.brand.red,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  avatarText: {
    color: colors.white,
    fontSize: 30,
    fontFamily: fontFamilies.headingBlack,
  },
  userName: { fontSize: fontSizes.lg, fontFamily: fontFamilies.headingBlack, color: colors.ink },
  badgeRow: { marginTop: spacing.xs, marginBottom: spacing.md },
  badge: {
    backgroundColor: colors.brand.gold + '30',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  badgeText: { color: '#9A6B16', fontSize: fontSizes.xs, fontFamily: fontFamilies.bodyExtraBold },
  statsRow: {
    flexDirection: 'row',
    width: '100%',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: fontSizes.lg, fontFamily: fontFamilies.headingBlack, color: colors.ink },
  statLabel: { fontSize: fontSizes.xs, color: colors.text.muted, fontFamily: fontFamilies.body },
  statDivider: { width: 1, backgroundColor: colors.line },
  sectionTitle: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.headingBlack,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  group: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyBold,
    color: colors.ink,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderColor: colors.brand.red,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginTop: spacing.xl,
  },
  logoutText: {
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
  },
});
