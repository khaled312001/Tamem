/**
 * MerchantDashboardScreen
 *
 * Landing screen for the MERCHANT role. Shows a brand-gradient hero with
 * today's headline metrics and a 4-tile quick-action grid. Data is fetched
 * from `/merchant/me` and surfaced with a 5-minute TanStack Query cache,
 * pull-to-refresh, and a soft skeleton while the request is in flight.
 *
 * Intentionally kept self-contained — no imports from customer-facing
 * screens (Home/Orders/Profile). Brand tokens come from `theme/tokens` and
 * iconography is exclusively `lucide-react-native`.
 */
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';

import type { MerchantTabsParamList } from '../../navigation/MerchantTabs';
import {
  BarChart3,
  ClipboardList,
  Coins,
  Hourglass,
  Package,
  ShoppingBag,
  Star,
  Store,
  User,
  X,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
import {
  colors,
  fontFamilies,
  fontSizes,
  gradients,
  radii,
  shadows,
  spacing,
} from '../../theme/tokens';

interface MerchantSummary {
  storeName?: string | null;
  storeNameAr?: string | null;
  todayOrders?: number | null;
  todayRevenue?: number | null;
  pendingOrders?: number | null;
  productsCount?: number | null;
  rating?: number | null;
}

interface QuickTile {
  key: 'orders' | 'products' | 'profile' | 'stats';
  label: string;
  Icon: LucideIcon;
  tint: string;
  color: string;
}

// Map each tile to the destination tab. Stats has no dedicated screen yet
// so it routes back to the dashboard (a useful aggregate of today's KPIs
// already lives in the hero + secondary stats above).
type TabRoute = 'MerchantDashboard' | 'MerchantOrdersList' | 'MerchantProducts' | 'MerchantProfile';
const TILE_ROUTES: Record<QuickTile['key'], TabRoute> = {
  orders: 'MerchantOrdersList',
  products: 'MerchantProducts',
  profile: 'MerchantProfile',
  stats: 'MerchantDashboard',
};

const QUICK_TILES: QuickTile[] = [
  {
    key: 'orders',
    label: 'الطلبات',
    Icon: ClipboardList,
    tint: colors.brand.redLight,
    color: colors.brand.red,
  },
  {
    key: 'products',
    label: 'المنتجات',
    Icon: ShoppingBag,
    tint: colors.warningLight,
    color: colors.brand.gold,
  },
  {
    key: 'profile',
    label: 'الملف الشخصي',
    Icon: User,
    tint: colors.infoLight,
    color: colors.info,
  },
  {
    key: 'stats',
    label: 'إحصائيات',
    Icon: BarChart3,
    tint: colors.successLight,
    color: colors.success,
  },
];

function formatCurrency(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  return `${n.toLocaleString('ar-EG')} ج.م`;
}

function formatNumber(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString('ar-EG');
}

function formatRating(value: number | null | undefined): string {
  if (value == null) return '—';
  return Number(value).toFixed(1);
}

export function MerchantDashboardScreen() {
  // Bottom-tab navigation is the parent here, so the dashboard pushes to
  // sibling tabs (Orders / Products / Profile) when a quick-action tile
  // is tapped.
  const navigation = useNavigation<BottomTabNavigationProp<MerchantTabsParamList>>();

  // "إحصائيات" tile has no dedicated screen yet — open a coming-soon modal
  // instead of silently no-op'ing on press.
  const [statsModalOpen, setStatsModalOpen] = useState(false);

  const query = useQuery<MerchantSummary>({
    queryKey: ['merchant', 'me'],
    queryFn: async () => {
      const res = await api.raw.get('/merchant/me');
      return res.data.data as MerchantSummary;
    },
    staleTime: 5 * 60 * 1000,
  });

  const data = query.data;
  const storeName = data?.storeNameAr || data?.storeName || 'متجرك';

  const onRefresh = () => {
    query.refetch().catch((err) => {
      showToast({
        title: 'تعذّر تحديث البيانات',
        message: err instanceof Error ? err.message : undefined,
        tone: 'error',
      });
    });
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={query.isFetching && !query.isLoading}
            onRefresh={onRefresh}
            tintColor={colors.brand.red}
          />
        }
      >
        {/* Brand-gradient hero with store name + today's headline metrics */}
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, shadows.brand]}
        >
          <View style={styles.heroTopRow}>
            <View style={styles.heroBadge}>
              <Store size={16} color={colors.white} />
            </View>
            <Text style={styles.heroEyebrow}>لوحة التحكم</Text>
          </View>
          <Text style={styles.heroStoreName} numberOfLines={2}>
            {storeName}
          </Text>
          <Text style={styles.heroSubtitle}>متابعة أداء متجرك اليوم</Text>

          {query.isLoading ? (
            <ActivityIndicator color={colors.white} style={{ marginTop: spacing.lg }} />
          ) : (
            <View style={styles.heroStatsRow}>
              <HeroStat
                Icon={ClipboardList}
                label="طلبات اليوم"
                value={formatNumber(data?.todayOrders)}
              />
              <View style={styles.heroDivider} />
              <HeroStat
                Icon={Coins}
                label="إيرادات اليوم"
                value={formatCurrency(data?.todayRevenue)}
              />
            </View>
          )}
        </LinearGradient>

        {/* Secondary stats — pending, products, rating */}
        <View style={styles.statsGrid}>
          <StatTile
            Icon={Hourglass}
            label="قيد الانتظار"
            value={formatNumber(data?.pendingOrders)}
            tint={colors.warningLight}
            color={colors.brand.gold}
          />
          <StatTile
            Icon={Package}
            label="المنتجات"
            value={formatNumber(data?.productsCount)}
            tint={colors.infoLight}
            color={colors.info}
          />
          <StatTile
            Icon={Star}
            label="التقييم"
            value={formatRating(data?.rating)}
            tint={colors.brand.redLight}
            color={colors.brand.red}
          />
        </View>

        {/* Quick-action grid — navigation is wired by the navigation agent. */}
        <Text style={styles.sectionTitle}>اختصارات سريعة</Text>
        <View style={styles.tilesGrid}>
          {QUICK_TILES.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => {
                if (t.key === 'stats') {
                  setStatsModalOpen(true);
                  return;
                }
                navigation.navigate(TILE_ROUTES[t.key]);
              }}
              style={({ pressed }) => [
                styles.tile,
                shadows.sm,
                pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
              ]}
            >
              <View style={[styles.tileIcon, { backgroundColor: t.tint }]}>
                <t.Icon size={24} color={t.color} />
              </View>
              <Text style={styles.tileLabel}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Modal
        visible={statsModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setStatsModalOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setStatsModalOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Pressable
              onPress={() => setStatsModalOpen(false)}
              hitSlop={8}
              style={styles.modalCloseBtn}
            >
              <X size={18} color={colors.text.muted} />
            </Pressable>
            <View style={styles.modalIcon}>
              <BarChart3 size={28} color={colors.success} />
            </View>
            <Text style={styles.modalTitle}>إحصائيات تفصيلية قريباً</Text>
            <Text style={styles.modalBody}>
              نشتغل على شاشة إحصائيات أعمق مع رسوم بيانية شهرية وتقارير المبيعات لكل منتج. حالياً
              الأرقام الأساسية معروضة في الأعلى.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setStatsModalOpen(false)}
                style={({ pressed }) => [styles.modalBtn, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.modalBtnText}>حسناً</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function HeroStat({ Icon, label, value }: { Icon: LucideIcon; label: string; value: string }) {
  return (
    <View style={styles.heroStat}>
      <View style={styles.heroStatIcon}>
        <Icon size={16} color={colors.white} />
      </View>
      <Text style={styles.heroStatValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

interface StatTileProps {
  Icon: LucideIcon;
  label: string;
  value: string;
  tint: string;
  color: string;
}

function StatTile({ Icon, label, value, tint, color }: StatTileProps) {
  return (
    <View style={[styles.statCard, shadows.sm]}>
      <View style={[styles.statIcon, { backgroundColor: tint }]}>
        <Icon size={18} color={color} />
      </View>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { paddingBottom: spacing.xxl },
  // Hero
  hero: {
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.xl,
    gap: spacing.sm,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroBadge: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEyebrow: {
    color: colors.white,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
    letterSpacing: 0.6,
  },
  heroStoreName: {
    color: colors.white,
    fontFamily: fontFamilies.headingBlack,
    fontSize: fontSizes.xl,
    marginTop: spacing.xs,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  heroStat: {
    flex: 1,
    gap: 4,
  },
  heroStatIcon: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  heroStatValue: {
    color: colors.white,
    fontFamily: fontFamilies.headingBlack,
    fontSize: fontSizes.lg,
  },
  heroStatLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xxs,
  },
  heroDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  // Secondary stats grid
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: 4,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  statValue: {
    fontFamily: fontFamilies.headingBlack,
    fontSize: fontSizes.md,
    color: colors.ink,
  },
  statLabel: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xxs,
    color: colors.text.muted,
  },
  // Quick tiles
  sectionTitle: {
    fontFamily: fontFamilies.headingBlack,
    fontSize: fontSizes.lg,
    color: colors.ink,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  tilesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    flex: 1,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
    color: colors.ink,
  },
  // Coming-soon modal for the "إحصائيات" tile
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
    ...shadows.sm,
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 32,
    height: 32,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  modalIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  modalTitle: {
    fontFamily: fontFamilies.headingBlack,
    fontSize: fontSizes.lg,
    color: colors.ink,
    textAlign: 'center',
  },
  modalBody: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.text.secondary,
    lineHeight: 22,
    textAlign: 'center',
  },
  modalActions: {
    marginTop: spacing.md,
    width: '100%',
  },
  modalBtn: {
    backgroundColor: colors.brand.red,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  modalBtnText: {
    fontFamily: fontFamilies.bodyBold,
    color: colors.white,
    fontSize: fontSizes.sm,
  },
});
