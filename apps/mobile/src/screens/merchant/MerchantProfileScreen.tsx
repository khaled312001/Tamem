/**
 * MerchantProfileScreen
 *
 * Read-only store identity card plus the merchant-account action menu.
 * Shows the store's bilingual name, address, governorate, and current
 * rating, then surfaces three actions:
 *   - تعديل بيانات المتجر — placeholder, navigates to a TODO route
 *   - تغيير ساعات العمل — placeholder, navigates to a TODO route
 *   - تسجيل خروج — calls `useAuth().clear()` so the root navigator
 *     bounces the user back to the auth stack.
 *
 * The two placeholder routes intentionally do nothing today — the
 * navigation agent will wire them once the corresponding edit screens
 * ship. We warn via Alert.alert so the merchant gets immediate feedback.
 */
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Clock, LogOut, MapPin, Pencil, Star, Store } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../lib/api';
import { showToast } from '../../lib/toast';
import { useAuth } from '../../stores/auth';
import { colors, fontFamilies, fontSizes, radii, shadows, spacing } from '../../theme/tokens';

interface MerchantProfile {
  storeName?: string | null;
  storeNameAr?: string | null;
  addressLine?: string | null;
  governorate?: string | null;
  rating?: number | null;
}

export function MerchantProfileScreen() {
  // Navigation reserved for the edit-store / hours screens once they
  // exist — keeping the hook here avoids a later refactor when they're
  // wired up.
  const navigation = useNavigation();
  void navigation;
  const clear = useAuth((s) => s.clear);

  const query = useQuery<MerchantProfile>({
    queryKey: ['merchant', 'me'],
    queryFn: async () => {
      const res = await api.raw.get('/merchant/me');
      return res.data.data as MerchantProfile;
    },
    staleTime: 5 * 60 * 1000,
  });

  const data = query.data;
  const displayName = data?.storeNameAr || data?.storeName || 'متجرك';
  const subName = data?.storeNameAr && data?.storeName ? data.storeName : null;

  // Stubbed actions — the dedicated screens haven't been built yet so
  // we surface a friendly "coming soon" Alert instead of triggering a
  // navigation error. When the screens land we'll swap these for
  // navigation.navigate(...) calls.
  const onEditStore = () => {
    Alert.alert('قريباً', 'تعديل بيانات المتجر سيكون متاحاً قريباً من هنا.');
  };

  const onEditHours = () => {
    Alert.alert('قريباً', 'تغيير ساعات العمل سيكون متاحاً قريباً من هنا.');
  };

  const onLogout = () => {
    Alert.alert('تأكيد تسجيل الخروج', 'هل تريد تسجيل الخروج من حساب المتجر؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'تسجيل خروج',
        style: 'destructive',
        onPress: () => {
          clear()
            .then(() => {
              try {
                showToast({ title: 'تم تسجيل الخروج', tone: 'success' });
              } catch {
                /* toast is best-effort */
              }
            })
            .catch((err) => {
              const message = err instanceof Error ? err.message : 'حدث خطأ';
              Alert.alert('تعذّر تسجيل الخروج', message);
            });
        },
      },
    ]);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={query.isFetching && !query.isLoading}
            onRefresh={() => query.refetch()}
            tintColor={colors.brand.red}
          />
        }
      >
        <View style={[styles.identityCard, shadows.sm]}>
          <View style={styles.identityHead}>
            <View style={styles.identityIcon}>
              <Store size={22} color={colors.brand.red} />
            </View>
            <View style={{ flex: 1 }}>
              {query.isLoading ? (
                <ActivityIndicator color={colors.brand.red} />
              ) : (
                <>
                  <Text style={styles.identityName} numberOfLines={2}>
                    {displayName}
                  </Text>
                  {subName ? (
                    <Text style={styles.identitySubName} numberOfLines={1}>
                      {subName}
                    </Text>
                  ) : null}
                </>
              )}
            </View>
          </View>

          <View style={styles.identityMetaRow}>
            <View style={styles.identityMeta}>
              <MapPin size={14} color={colors.text.secondary} />
              <Text style={styles.identityMetaText} numberOfLines={1}>
                {data?.addressLine ?? 'العنوان غير محدد'}
              </Text>
            </View>
            {data?.governorate ? (
              <View style={styles.identityMeta}>
                <Text style={styles.identityMetaText}>{data.governorate}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.ratingRow}>
            <Star size={16} color={colors.brand.gold} fill={colors.brand.gold} />
            <Text style={styles.ratingValue}>
              {data?.rating != null ? Number(data.rating).toFixed(1) : '—'}
            </Text>
            <Text style={styles.ratingLabel}>تقييم العملاء</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>الإعدادات</Text>

        <View style={styles.menuCard}>
          <MenuItem
            Icon={Pencil}
            label="تعديل بيانات المتجر"
            sublabel="الاسم، العنوان، صورة الغلاف"
            onPress={onEditStore}
          />
          <View style={styles.menuDivider} />
          <MenuItem
            Icon={Clock}
            label="تغيير ساعات العمل"
            sublabel="مواعيد الفتح والإغلاق يومياً"
            onPress={onEditHours}
          />
          <View style={styles.menuDivider} />
          <MenuItem Icon={LogOut} label="تسجيل خروج" destructive onPress={onLogout} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

interface MenuItemProps {
  Icon: LucideIcon;
  label: string;
  sublabel?: string;
  destructive?: boolean;
  onPress: () => void;
}

function MenuItem({ Icon, label, sublabel, destructive, onPress }: MenuItemProps) {
  const tint = destructive ? colors.dangerLight : colors.brand.redLight;
  const fg = destructive ? colors.danger : colors.brand.red;
  const titleColor = destructive ? colors.danger : colors.ink;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.menuItemIcon, { backgroundColor: tint }]}>
        <Icon size={18} color={fg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.menuItemLabel, { color: titleColor }]}>{label}</Text>
        {sublabel ? <Text style={styles.menuItemSub}>{sublabel}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { paddingVertical: spacing.lg, paddingBottom: spacing.xxl },
  // Identity
  identityCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.md,
  },
  identityHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  identityIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityName: {
    fontFamily: fontFamilies.headingBlack,
    fontSize: fontSizes.lg,
    color: colors.ink,
  },
  identitySubName: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  identityMetaRow: { gap: spacing.xs },
  identityMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  identityMetaText: {
    fontFamily: fontFamilies.body,
    color: colors.text.secondary,
    fontSize: fontSizes.sm,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  ratingValue: {
    fontFamily: fontFamilies.headingBlack,
    color: colors.ink,
    fontSize: fontSizes.md,
  },
  ratingLabel: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.xs,
  },
  // Menu
  sectionLabel: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    letterSpacing: 0.4,
  },
  menuCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  menuItemIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
  },
  menuItemSub: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  menuDivider: { height: 1, backgroundColor: colors.line },
});
