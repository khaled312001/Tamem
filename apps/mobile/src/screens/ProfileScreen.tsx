import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  CreditCard,
  Gift,
  HeadphonesIcon,
  Heart,
  LogOut,
  MapPin,
  Package,
  Shield,
  Star,
  User,
  Wallet,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientHeader } from '../components/GradientHeader';
import { Divider, ListItem, SecondaryButton } from '../components/ui';
import { api } from '../lib/api';
import { isNotificationSoundMuted, setNotificationSoundMuted } from '../lib/notificationSound';
import { connectSocket } from '../lib/socket';
import type { ProfileStackParamList } from '../navigation/ProfileStack';
import { useAuth } from '../stores/auth';
import { colors, fontFamilies, fontSizes, radii, shadows, spacing } from '../theme/tokens';

type Nav = NativeStackNavigationProp<ProfileStackParamList, 'Profile'>;

interface UserExt {
  id?: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
}

interface OrdersListResponse {
  meta?: { total?: number };
  data: Array<{ id: string }>;
}

interface AddressItem {
  id: string;
  label: string;
}

interface WalletInfo {
  wallet?: { balance?: string | number | null };
}

export function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const qc = useQueryClient();
  const storedUser = useAuth((s) => s.user) as UserExt | null;
  const setStoredUser = useAuth((s) => s.setUser);
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

  // Refresh from /me so stats stay accurate even if the stored session is
  // stale (e.g. after a profile edit from another device).
  const meQuery = useQuery({
    queryKey: ['profile', 'me'],
    queryFn: async () => {
      const res = await api.raw.get('/me');
      const fresh = res.data.data as UserExt;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (fresh) void setStoredUser(fresh as any);
      return fresh;
    },
  });

  const user = (meQuery.data ?? storedUser) as UserExt | null;

  // Total orders count — pageSize 1 so we only fetch the meta.total counter.
  // staleTime 0 so coming back to this tab always refetches; the count needs
  // to be current after a new order or cancellation.
  const ordersQuery = useQuery({
    queryKey: ['profile', 'orders-count'],
    queryFn: async () => {
      const res = await api.raw.get('/orders/mine', { params: { pageSize: 1 } });
      const body = res.data as OrdersListResponse;
      return body.meta?.total ?? body.data?.length ?? 0;
    },
    staleTime: 0,
  });

  // Saved addresses count.
  const addressesQuery = useQuery({
    queryKey: ['profile', 'addresses'],
    queryFn: async () => {
      const res = await api.raw.get('/me/addresses');
      return (res.data.data as AddressItem[]) ?? [];
    },
    staleTime: 0,
  });

  // Wallet balance.
  const walletQuery = useQuery({
    queryKey: ['profile', 'wallet'],
    queryFn: async () => {
      const res = await api.raw.get('/me/wallet');
      return res.data.data as WalletInfo;
    },
    staleTime: 0,
  });

  // Refresh whenever the Profile tab gets focus (cheap — pageSize:1 queries).
  useFocusEffect(
    useCallback(() => {
      void ordersQuery.refetch();
      void addressesQuery.refetch();
      void walletQuery.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  // Live updates: when a new order arrives or a status changes anywhere in
  // the app, the count/balance becomes stale — invalidate the trio.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await connectSocket();
      const refresh = () => {
        if (cancelled) return;
        void qc.invalidateQueries({ queryKey: ['profile', 'orders-count'] });
        void qc.invalidateQueries({ queryKey: ['profile', 'wallet'] });
      };
      s.on('order:new', refresh);
      s.on('order:status', refresh);
      return () => {
        s.off('order:new', refresh);
        s.off('order:status', refresh);
      };
    })();
    return () => {
      cancelled = true;
    };
  }, [qc]);

  const refetchAll = () => {
    void meQuery.refetch();
    void ordersQuery.refetch();
    void addressesQuery.refetch();
    void walletQuery.refetch();
  };

  const isRefreshing =
    meQuery.isFetching ||
    ordersQuery.isFetching ||
    addressesQuery.isFetching ||
    walletQuery.isFetching;

  const orderCount = ordersQuery.data ?? 0;
  const addressesCount = addressesQuery.data?.length ?? 0;
  const walletBalance = Number(walletQuery.data?.wallet?.balance ?? 0);

  const onLogout = () => {
    Alert.alert('تأكيد تسجيل الخروج', 'هل تريد بالفعل تسجيل الخروج من حسابك؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تسجيل الخروج', style: 'destructive', onPress: () => void clear() },
    ]);
  };

  const initial = (user?.name?.charAt(0) || 'ت').toUpperCase();

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <GradientHeader greeting="حسابي" location={user?.phone ?? ''} hideBack />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refetchAll}
            tintColor={colors.brand.red}
          />
        }
      >
        {/* ─────── Profile hero card ─────── */}
        <View style={[styles.profileCard, shadows.md]}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              {user?.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarText}>{initial}</Text>
              )}
            </View>
            <View style={styles.verifiedBadge}>
              <Shield size={10} color={colors.white} />
            </View>
          </View>

          <Text style={styles.userName}>{user?.name ?? 'مستخدم'}</Text>
          <Text style={styles.userPhone}>{user?.phone ?? ''}</Text>
          {user?.email ? <Text style={styles.userEmail}>{user.email}</Text> : null}

          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Star size={12} color="#9A6B16" fill="#9A6B16" />
              <Text style={styles.badgeText}>عميل مميز</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <View style={[styles.statIconWrap, { backgroundColor: colors.brand.redLight }]}>
                <Package size={16} color={colors.brand.red} />
              </View>
              <Text style={styles.statValue}>{orderCount}</Text>
              <Text style={styles.statLabel}>طلباتي</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <View style={[styles.statIconWrap, { backgroundColor: colors.successLight }]}>
                <Wallet size={16} color={colors.success} />
              </View>
              <Text style={styles.statValue}>{walletBalance.toLocaleString('ar-EG')}</Text>
              <Text style={styles.statLabel}>رصيد ج.م</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <View style={[styles.statIconWrap, { backgroundColor: colors.infoLight }]}>
                <MapPin size={16} color={colors.info} />
              </View>
              <Text style={styles.statValue}>{addressesCount}</Text>
              <Text style={styles.statLabel}>عناوين</Text>
            </View>
          </View>
        </View>

        {/* ─────── Account section ─────── */}
        <Text style={styles.sectionTitle}>الحساب</Text>
        <View style={[styles.group, shadows.sm]}>
          <ListItem
            label="البيانات الشخصية"
            sublabel="الاسم، الصورة، البريد"
            Icon={User}
            onPress={() => navigation.navigate('EditProfile')}
          />
          <Divider inset />
          <ListItem
            label="عناويني المحفوظة"
            sublabel={
              addressesCount > 0 ? `${addressesCount} عنوان محفوظ` : 'أضف عنوان لتسريع الطلبات'
            }
            Icon={MapPin}
            onPress={() => navigation.navigate('SavedAddresses')}
          />
          <Divider inset />
          <ListItem
            label="محفظتي"
            sublabel={`الرصيد ${walletBalance.toLocaleString('ar-EG')} ج.م`}
            Icon={Wallet}
            onPress={() => navigation.navigate('Wallet')}
          />
          <Divider inset />
          <ListItem
            label="طرق الدفع"
            sublabel="كاش، فودافون كاش، إنستا باي"
            Icon={CreditCard}
            onPress={() => navigation.navigate('PaymentMethods')}
          />
        </View>

        {/* ─────── Discovery section ─────── */}
        <Text style={styles.sectionTitle}>المفضلة والعروض</Text>
        <View style={[styles.group, shadows.sm]}>
          <ListItem
            label="المتاجر المفضلة"
            sublabel="المتاجر اللي اخترتها من ❤️"
            Icon={Heart}
            onPress={() => navigation.navigate('Favorites')}
          />
          <Divider inset />
          <ListItem
            label="العروض والكوبونات"
            sublabel="أكواد خصم حصرية لطلباتك"
            Icon={Gift}
            onPress={() => navigation.navigate('Coupons')}
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
            sublabel="مهمتنا، فريقنا، وطرق التواصل"
            Icon={Shield}
            onPress={() => navigation.navigate('About')}
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
  avatarWrap: { position: 'relative', marginBottom: spacing.sm },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.brand.red,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: {
    color: colors.white,
    fontSize: 34,
    fontFamily: fontFamilies.headingBlack,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
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
  userEmail: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    marginTop: 2,
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
  statItem: { flex: 1, alignItems: 'center', gap: 6 },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.headingBlack,
    color: colors.ink,
  },
  statLabel: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
  },
  statDivider: { width: 1, backgroundColor: colors.line, marginVertical: 8 },
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
