import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  CreditCard,
  HeadphonesIcon,
  Heart,
  LogOut,
  MapPin,
  Package,
  Settings,
  Shield,
  Star,
  User,
  Wallet,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientHeader } from '../components/GradientHeader';
import { Divider, ListItem, SecondaryButton } from '../components/ui';
import { api } from '../lib/api';
import { isNotificationSoundMuted, setNotificationSoundMuted } from '../lib/notificationSound';
import type { ProfileStackParamList } from '../navigation/ProfileStack';
import { useAuth } from '../stores/auth';
import { colors, fontFamilies, fontSizes, radii, shadows, spacing } from '../theme/tokens';

type Nav = NativeStackNavigationProp<ProfileStackParamList, 'Profile'>;

interface OrdersCountResponse {
  total: number;
}

export function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const user = useAuth((s) => s.user);
  const clear = useAuth((s) => s.clear);
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const muted = await isNotificationSoundMuted();
      if (alive) setSoundOn(!muted);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const toggleSound = (v: boolean) => {
    setSoundOn(v);
    void setNotificationSoundMuted(!v);
  };

  const { data: orderCount } = useQuery<OrdersCountResponse>({
    queryKey: ['my-orders-count'],
    queryFn: async () => {
      const res = await api.raw.get('/orders/mine', { params: { pageSize: 1 } });
      return { total: res.data.meta?.total ?? res.data.data?.length ?? 0 };
    },
  });

  const onLogout = () => {
    Alert.alert('تأكيد تسجيل الخروج', 'هل تريد بالفعل تسجيل الخروج من حسابك؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تسجيل الخروج', style: 'destructive', onPress: () => void clear() },
    ]);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <GradientHeader greeting="حسابي" location={user?.phone ?? ''} hideBack />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ─────── Profile hero card ─────── */}
        <View style={[styles.profileCard, shadows.md]}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase() ?? 'ت'}</Text>
            </View>
            <View style={styles.verifiedBadge}>
              <Shield size={10} color={colors.white} />
            </View>
          </View>
          <Text style={styles.userName}>{user?.name ?? 'مستخدم'}</Text>
          <Text style={styles.userPhone}>{user?.phone ?? ''}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Star size={12} color="#9A6B16" fill="#9A6B16" />
              <Text style={styles.badgeText}>عميل مميز</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Package size={14} color={colors.brand.red} />
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
              <MapPin size={14} color={colors.info} />
              <Text style={styles.statValue}>1</Text>
              <Text style={styles.statLabel}>عناوين</Text>
            </View>
          </View>
        </View>

        {/* ─────── Account section ─────── */}
        <Text style={styles.sectionTitle}>الحساب</Text>
        <View style={[styles.group, shadows.sm]}>
          <ListItem
            label="البيانات الشخصية"
            sublabel="تعديل الاسم والبريد"
            Icon={User}
            onPress={() => navigation.navigate('EditProfile')}
          />
          <Divider inset />
          <ListItem
            label="عناويني المحفوظة"
            sublabel="المنزل، العمل، وغيرها"
            Icon={MapPin}
            onPress={() => navigation.navigate('SavedAddresses')}
          />
          <Divider inset />
          <ListItem
            label="محفظتي"
            sublabel="رصيدك وحركات المحفظة"
            Icon={Wallet}
            onPress={() => navigation.navigate('Wallet')}
          />
          <Divider inset />
          <ListItem
            label="طرق الدفع"
            sublabel="فيزا، فودافون كاش، انستاباي"
            Icon={CreditCard}
            onPress={() => navigation.navigate('PaymentMethods')}
          />
        </View>

        {/* ─────── Preferences section ─────── */}
        <Text style={styles.sectionTitle}>الإعدادات</Text>
        <View style={[styles.group, shadows.sm]}>
          <ListItem
            label="صوت الإشعارات"
            sublabel="تشغيل أو إيقاف الصوت داخل التطبيق"
            Icon={Bell}
            trailing={
              <Switch
                trackColor={{ false: colors.line2, true: colors.brand.red }}
                thumbColor={colors.white}
                value={soundOn}
                onValueChange={toggleSound}
                ios_backgroundColor={colors.line2}
              />
            }
          />
          <Divider inset />
          <ListItem
            label="الإعدادات العامة"
            sublabel="اللغة، الإشعارات، الخصوصية"
            Icon={Settings}
            onPress={() => {
              // Future: settings screen
              Alert.alert('قريباً', 'صفحة الإعدادات قيد التطوير');
            }}
          />
        </View>

        {/* ─────── Help section ─────── */}
        <Text style={styles.sectionTitle}>الدعم والمساعدة</Text>
        <View style={[styles.group, shadows.sm]}>
          <ListItem
            label="مركز المساعدة"
            sublabel="أسئلة شائعة وطرق التواصل"
            Icon={HeadphonesIcon}
            onPress={() => navigation.navigate('Support')}
          />
          <Divider inset />
          <ListItem
            label="عن تَميم"
            sublabel="معرفة المزيد عن منصتنا"
            Icon={Heart}
            onPress={() => {
              Alert.alert(
                'عن تَميم',
                'منصة تَميم للتوصيل والشحن — نوصّل طلباتك بأمان وسرعة داخل وخارج المدينة.',
              );
            }}
          />
        </View>

        {/* ─────── Logout + version ─────── */}
        <View style={{ marginTop: spacing.xl }}>
          <SecondaryButton label="تسجيل الخروج" Icon={LogOut} onPress={onLogout} />
        </View>

        <Text style={styles.versionText}>الإصدار 0.1.0 — تَميم للتوصيل</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  // Profile hero
  profileCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.lg,
    alignItems: 'center',
    borderColor: colors.line,
    borderWidth: 1,
    marginTop: -spacing.md,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.brand.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.white,
    fontSize: 34,
    fontFamily: fontFamilies.headingBlack,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 2,
    end: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  userName: {
    fontSize: fontSizes.xl,
    fontFamily: fontFamilies.headingBlack,
    color: colors.ink,
  },
  userPhone: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    marginTop: 4,
  },
  badgeRow: { marginTop: spacing.sm, marginBottom: spacing.md },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brand.gold + '20',
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  badgeText: {
    color: '#9A6B16',
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  statsRow: {
    flexDirection: 'row',
    width: '100%',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.headingBlack,
    color: colors.ink,
  },
  statLabel: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
  },
  statDivider: { width: 1, backgroundColor: colors.line },
  // Sections
  sectionTitle: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.headingBlack,
    color: colors.text.muted,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.xs,
  },
  group: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  versionText: {
    textAlign: 'center',
    fontSize: fontSizes.xxs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    marginTop: spacing.xl,
  },
});
