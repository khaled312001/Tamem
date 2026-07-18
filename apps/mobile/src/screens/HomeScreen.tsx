import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Bell,
  ChevronDown,
  MapPin,
  Package,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  Truck,
} from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HeartButton } from '../components/HeartButton';
import { QuickOrderFAB } from '../components/QuickOrderFAB';
import { BannerCarousel } from '../components/home/BannerCarousel';
import { CategoriesStrip } from '../components/home/CategoriesStrip';
import { CouponBanner } from '../components/home/CouponBanner';
import { FeatureStrip } from '../components/home/FeatureStrip';
import { ServiceCards, type HomeService } from '../components/home/ServiceCards';
import { SearchOverlay } from '../components/home/SearchOverlay';
import {
  AnimatedListItem,
  Badge,
  ForwardChevron,
  MerchantSkeleton,
  Rating,
  SectionHeader,
  StatusPill,
} from '../components/ui';
import { api } from '../lib/api';
import { copyToClipboard } from '../lib/clipboard';
import { haptic } from '../lib/haptics';
import type { HomeStackParamList } from '../navigation/HomeStack';
import { useAuth } from '../stores/auth';
import { ACTIVE_STATUSES, FALLBACK_PROMO_CODE, SERVICE_CARD_COPY } from './home/homeData';
import {
  colors,
  fontFamilies,
  fontSizes,
  gradients,
  radii,
  shadows,
  spacing,
} from '../theme/tokens';

import { ORDER_STATUS_AR, type OrderStatus } from '@tamem/types';

type NavProp = NativeStackNavigationProp<HomeStackParamList, 'Home'>;

interface Offer {
  id: string;
  title: string;
  titleAr: string;
  imageUrl?: string;
  code?: string | null;
  termsAr?: string | null;
}

interface Merchant {
  id: string;
  storeNameAr: string;
  rating?: number | null;
  isOpen: boolean;
  category?: { nameAr: string };
  /// Server-computed openness — preferred over the raw isOpen toggle.
  openness?: { isOpenNow: boolean; message: string | null };
}

interface ActiveOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  category: string;
  finalPrice?: number | null;
  quotedPrice?: number | null;
  service?: { nameAr: string };
}

interface SavedAddress {
  id: string;
  label: string;
  address: string;
  isDefault: boolean;
}

/** Server-driven home configuration. Every field can be null → use defaults. */
interface HomeConfig {
  heroGreeting: string | null;
  heroSubtitle: string | null;
  heroGradient: string[] | null;
  trustStripTitle: string | null;
  trustStripSubtitle: string | null;
  promoBannerCouponId: string | null;
  promoBannerTitle: string | null;
  promoBannerCode: string | null;
  /// Inlined by the backend when promoBannerCouponId points to a still-valid
  /// coupon. Pre-resolved so the mobile doesn't have to do a second lookup.
  promoCoupon: {
    id: string;
    code: string;
    type: 'PERCENTAGE' | 'FLAT';
    value: string;
    description: string | null;
  } | null;
  visibleServiceKeys: string[] | null;
  featuredMerchantIds: string[] | null;
  featuredOfferIds: string[] | null;
  showPromoBanner: boolean;
  showTrustStrip: boolean;
}

const SERVICES = [
  {
    key: 'delivery',
    label: 'دليفري داخل المدينة',
    sub: 'طلب بقالة، صيدلية، مطاعم',
    Icon: ShoppingBag,
    gradient: gradients.brand,
    route: 'DeliveryServices' as const,
  },
  {
    key: 'shipping',
    label: 'شحن بين المحافظات',
    sub: 'باركس، أثاث، شحنات كبيرة',
    Icon: Package,
    gradient: gradients.brandGold,
    route: 'ShippingFlow' as const,
  },
  {
    key: 'merchant',
    label: 'طلبات التجار والموزعين',
    sub: 'كميات جملة، عدة منتجات',
    Icon: Truck,
    gradient: gradients.promoGold,
    route: 'MerchantFlow' as const,
  },
] as const;

const tickHaptic = () => haptic.tap();

export function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const user = useAuth((s) => s.user);
  // Search starts collapsed as a tappable pill; tapping it opens the
  // SearchOverlay which owns the actual TextInput + live suggestions.
  const [searchOpen, setSearchOpen] = useState(false);

  const onPromo = async () => {
    // Prefer the coupon code resolved by the backend → free-text override
    // → the legacy offer → the fallback constant.
    const code =
      homeConfig?.promoCoupon?.code ||
      homeConfig?.promoBannerCode ||
      topOffer?.code ||
      FALLBACK_PROMO_CODE;
    const copied = await copyToClipboard(code);
    Alert.alert(
      copied ? 'تم نسخ الكود ✓' : `كود الخصم: ${code}`,
      copied
        ? `استخدم "${code}" عند تأكيد طلبك للحصول على الخصم.`
        : 'انسخه واستخدمه عند تأكيد الطلب.',
    );
  };

  // Defer every authenticated query until the auth store has hydrated and
  // a user is present — otherwise a cold-start race fires these against the
  // API before the token loads from secure storage and the backend rejects
  // them with 401.
  const authReady = !!user;

  const { data: offers } = useQuery<Offer[]>({
    queryKey: ['offers'],
    queryFn: () => api.raw.get('/offers').then((r) => r.data.data),
    enabled: authReady,
  });

  const { data: merchants, isLoading: loadingMerchants } = useQuery<Merchant[]>({
    queryKey: ['merchants'],
    queryFn: () => api.raw.get('/merchants').then((r) => r.data.data),
    enabled: authReady,
  });

  const { data: myOrders } = useQuery<ActiveOrder[]>({
    queryKey: ['orders-mine'],
    queryFn: () => api.raw.get('/orders/mine').then((r) => r.data.data),
    enabled: authReady,
    // Keep the "active order" strip live on the home screen.
    refetchInterval: 30_000,
  });

  // Saved addresses — used to (1) drive the location row in the hero so it
  // shows the customer's actual default rather than "قفط — قنا" hardcoded,
  // and (2) surface a banner if they haven't saved any yet (because the
  // backend will refuse to create orders without one).
  const { data: addresses } = useQuery<SavedAddress[]>({
    queryKey: ['my-addresses'],
    queryFn: () => api.raw.get('/me/addresses').then((r) => r.data.data),
    enabled: authReady,
  });
  const defaultAddress = (addresses ?? []).find((a) => a.isDefault) ?? addresses?.[0];
  const needsAddress = (addresses?.length ?? 0) === 0;

  // Server-driven home content — admin can override text, gradient colors,
  // visible services, featured merchants/offers from the dashboard.
  const { data: homeConfig } = useQuery<HomeConfig>({
    queryKey: ['home-config'],
    queryFn: () => api.raw.get('/home-config').then((r) => r.data.data),
    // Stale for 5 min — admins rarely edit hourly, and we don't want every
    // tab switch to refetch.
    staleTime: 5 * 60_000,
    enabled: authReady,
  });

  // Resolve the visible services list: server filter > all hard-coded.
  const visibleServices =
    homeConfig?.visibleServiceKeys && homeConfig.visibleServiceKeys.length > 0
      ? SERVICES.filter((s) => homeConfig.visibleServiceKeys!.includes(s.key))
      : SERVICES;

  const activeOrder = (myOrders ?? []).find((o) => ACTIVE_STATUSES.includes(o.status));

  // Featured offer: if admin pinned IDs, take the first match; else newest.
  const topOffer =
    homeConfig?.featuredOfferIds && homeConfig.featuredOfferIds.length > 0
      ? ((offers ?? []).find((o) => homeConfig.featuredOfferIds!.includes(o.id)) ?? offers?.[0])
      : offers?.[0];

  // Featured merchants: admin-pinned in order > top by rating slice.
  const featuredMerchants = (() => {
    if (!merchants) return [];
    if (homeConfig?.featuredMerchantIds && homeConfig.featuredMerchantIds.length > 0) {
      const idx = new Map(homeConfig.featuredMerchantIds.map((id, i) => [id, i]));
      return merchants
        .filter((m) => idx.has(m.id))
        .sort((a, b) => (idx.get(a.id) ?? 0) - (idx.get(b.id) ?? 0));
    }
    return merchants.slice(0, 4);
  })();

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* ─────── Light header (matches the design: bell left, location + avatar
          right, greeting, then the search bar — all on the warm surface) ─────── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable
            onPress={() => {
              tickHaptic();
              navigation.getParent()?.navigate('Notifications' as never);
            }}
            style={({ pressed }) => [styles.bellBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel="الإشعارات"
            hitSlop={6}
          >
            <Bell size={22} color={colors.brand.dark} />
            <View style={styles.bellDot} />
          </Pressable>

          <View style={styles.headerRight}>
            <Pressable
              onPress={() => {
                tickHaptic();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (navigation.getParent() as any)?.navigate('ProfileTab', {
                  screen: 'SavedAddresses',
                });
              }}
              style={styles.locationRow}
              accessibilityLabel="تغيير العنوان"
            >
              <ChevronDown size={14} color={colors.text.muted} />
              <Text style={styles.locationText} numberOfLines={1}>
                {defaultAddress?.label ?? (needsAddress ? 'أضف عنوان' : 'اختر العنوان')}
              </Text>
              <MapPin size={16} color={colors.brand.red} />
            </Pressable>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(user?.name ?? 'ت').trim().charAt(0)}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.greeting} numberOfLines={1}>
          👋 <Text style={styles.greetingName}>أهلاً {user?.name?.split(' ')[0] ?? 'بك'}</Text>
        </Text>
        <Text style={styles.greetingSub}>ماذا تريد أن تطلب اليوم؟</Text>

        <Pressable
          onPress={() => setSearchOpen(true)}
          style={({ pressed }) => [styles.searchBar, shadows.sm, pressed && { opacity: 0.92 }]}
          accessibilityRole="search"
          accessibilityLabel="افتح البحث"
        >
          <Search size={20} color={colors.text.muted} />
          <Text style={styles.searchText} numberOfLines={1}>
            ابحث عن مطعم، محل، منتج، أو خدمة…
          </Text>
          <SlidersHorizontal size={18} color={colors.text.muted} />
        </Pressable>
      </View>

      <SearchOverlay visible={searchOpen} onClose={() => setSearchOpen(false)} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ─────── No-address banner — blocks the customer from any order
            flow until they save at least one address. Backend will refuse
            the order anyway, so we surface the fix up front. ─────── */}
        {needsAddress && (
          <Pressable
            onPress={() => {
              tickHaptic();
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (navigation.getParent() as any)?.navigate('ProfileTab', {
                screen: 'SavedAddresses',
              });
            }}
            style={({ pressed }) => [styles.addressWarn, shadows.sm, pressed && { opacity: 0.92 }]}
          >
            <View style={styles.addressWarnIcon}>
              <MapPin size={20} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.addressWarnTitle}>سجّل عنوانك أولاً</Text>
              <Text style={styles.addressWarnSub}>
                لازم تضيف عنوان واحد على الأقل قبل ما تقدر تطلب
              </Text>
            </View>
            <ForwardChevron size={18} color={colors.white} />
          </Pressable>
        )}

        {/* ─────── Active order strip ─────── */}
        {activeOrder && (
          <Pressable
            onPress={() => {
              tickHaptic();
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (navigation.getParent() as any)?.navigate('Orders', {
                screen: 'OrderTracking',
                params: { orderId: activeOrder.id },
              });
            }}
            style={({ pressed }) => [
              styles.activeOrderCard,
              shadows.sm,
              pressed && { opacity: 0.92 },
            ]}
          >
            <View style={styles.activeOrderIcon}>
              <Truck size={20} color={colors.brand.red} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.activeOrderLabel}>طلبك الحالي</Text>
              <Text style={styles.activeOrderNumber}>#{activeOrder.orderNumber}</Text>
            </View>
            <StatusPill
              label={ORDER_STATUS_AR[activeOrder.status]}
              color={colors.status[activeOrder.status]}
              dot
            />
            <ForwardChevron size={18} color={colors.text.muted} />
          </Pressable>
        )}

        {/* ─────── Coupon banner — admin-controlled (Coupons table / home-config),
              placed right under the search per the design. ─────── */}
        {(() => {
          if (!(homeConfig?.showPromoBanner ?? true)) return null;
          const coupon = homeConfig?.promoCoupon;
          const discountText = coupon
            ? coupon.type === 'PERCENTAGE'
              ? `خصم ${Number(coupon.value)}%`
              : `خصم ${Number(coupon.value)} ج.م`
            : (homeConfig?.promoBannerTitle ?? topOffer?.titleAr ?? 'خصم على أول طلب');
          const subtitle = coupon?.description || 'على أول طلب';
          const code = coupon?.code ?? homeConfig?.promoBannerCode ?? topOffer?.code ?? null;
          if (!discountText && !code) return null;
          return (
            <CouponBanner
              discountText={discountText}
              subtitle={subtitle}
              code={code ?? FALLBACK_PROMO_CODE}
              onPress={onPromo}
            />
          );
        })()}

        {/* ─────── Services — the three headline cards (دليفري / شحن / تاجر) ─────── */}
        <ServiceCards
          services={visibleServices.map(
            (s): HomeService => ({
              key: s.key,
              title: SERVICE_CARD_COPY[s.key].title,
              subtitle: SERVICE_CARD_COPY[s.key].subtitle,
              onPress: () => {
                tickHaptic();
                navigation.navigate(s.route);
              },
            }),
          )}
        />

        {/* ─────── Trust / feature strip ─────── */}
        <FeatureStrip />

        {/* ─────── Categories strip — fetched from /categories, drills
            into a category-filtered StoresList. ─────── */}
        <CategoriesStrip />

        {/* ─────── Promotional banners carousel — sits between the
            categories strip and the merchants list per design.
            Renders nothing while loading / empty so the layout
            collapses cleanly. ─────── */}
        <BannerCarousel />

        {/* ─────── Featured merchants ─────── */}
        <SectionHeader
          title="متاجر قريبة منك"
          actionLabel="عرض الكل"
          onAction={() => navigation.navigate('StoresList')}
        />
        {loadingMerchants ? (
          <MerchantSkeleton count={3} />
        ) : featuredMerchants.length === 0 ? (
          <View style={styles.emptyMerchants}>
            <Store size={32} color={colors.text.muted} />
            <Text style={styles.emptyMerchantsText}>لا توجد متاجر مفتوحة قريبة منك حالياً</Text>
          </View>
        ) : (
          featuredMerchants.map((m, i) => (
            <AnimatedListItem key={m.id} index={i}>
              <Pressable
                onPress={() => navigation.navigate('MerchantDetail', { merchantId: m.id })}
                style={({ pressed }) => [
                  styles.merchantRow,
                  shadows.sm,
                  pressed && { opacity: 0.92 },
                ]}
              >
                <View style={styles.merchantThumb}>
                  <Store size={20} color={colors.brand.red} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.merchantName} numberOfLines={1}>
                    {m.storeNameAr}
                  </Text>
                  <View style={styles.merchantMetaRow}>
                    <Rating value={Number(m.rating ?? 0)} size="xs" />
                    <Text style={styles.merchantMetaDot}>·</Text>
                    <Text style={styles.merchantMetaText}>{m.category?.nameAr ?? '—'}</Text>
                  </View>
                </View>
                <Badge tone={(m.openness?.isOpenNow ?? m.isOpen) ? 'success' : 'neutral'} size="sm">
                  {(m.openness?.isOpenNow ?? m.isOpen) ? 'مفتوح' : 'مغلق'}
                </Badge>
                <HeartButton merchantId={m.id} merchantName={m.storeNameAr} size="sm" />
              </Pressable>
            </AnimatedListItem>
          ))
        )}

        {/* ─────── Trust strip — hidden when admin toggled off ─────── */}
        {(homeConfig?.showTrustStrip ?? true) && (
          <LinearGradient
            colors={gradients.promo}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.trustStrip, shadows.md]}
          >
            <View style={styles.trustIconWrap}>
              <Truck size={20} color={colors.brand.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.trustTitle}>
                {homeConfig?.trustStripTitle ?? 'توصيل سريع خلال 30 دقيقة'}
              </Text>
              <Text style={styles.trustSub}>
                {homeConfig?.trustStripSubtitle ?? 'داخل مدينة قفط — للطلبات القريبة'}
              </Text>
            </View>
          </LinearGradient>
        )}
      </ScrollView>

      <QuickOrderFAB />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  // ── Light header ──
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 170,
  },
  locationText: {
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
    textAlign: 'right',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brand.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.white,
    fontFamily: fontFamilies.headingBlack,
    fontSize: fontSizes.md,
  },
  bellBtn: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...shadows.sm,
  },
  bellDot: {
    position: 'absolute',
    top: 8,
    end: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand.red,
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  greeting: {
    textAlign: 'right',
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.lg,
    color: colors.brand.dark,
    marginTop: 2,
  },
  greetingName: { color: colors.brand.red },
  greetingSub: {
    textAlign: 'right',
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.text.muted,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 52,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    marginTop: spacing.xs,
  },
  searchText: {
    flex: 1,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.text.muted,
    textAlign: 'right',
  },
  // Address warning — colored loud (brand-red bg) so it can't be missed
  addressWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.brand.red,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  addressWarnIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressWarnTitle: {
    color: colors.white,
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.md,
  },
  addressWarnSub: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  // Scroll content
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120, // room for floating QuickOrderFAB without overlap
  },
  // Active order strip
  activeOrderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: spacing.lg,
  },
  activeOrderIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeOrderLabel: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
  },
  activeOrderNumber: {
    fontSize: fontSizes.md,
    color: colors.ink,
    fontFamily: fontFamilies.bodyExtraBold,
    marginTop: 2,
  },
  // Services
  servicesRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  // Banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    marginTop: spacing.xl,
  },
  bannerIcon: {
    width: 46,
    height: 46,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: {
    color: colors.white,
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.md,
  },
  bannerSub: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  bannerCode: {
    color: colors.brand.gold,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  bannerCopy: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.brand.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Merchant row
  merchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: spacing.sm,
  },
  merchantThumb: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  merchantName: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
  },
  merchantMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  merchantMetaText: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
  },
  merchantMetaDot: {
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
  },
  emptyMerchants: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  emptyMerchantsText: {
    fontSize: fontSizes.sm,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    textAlign: 'center',
  },
  // Trust strip
  trustStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.xl,
  },
  trustIconWrap: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    backgroundColor: 'rgba(242,169,59,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustTitle: {
    color: colors.white,
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.sm,
  },
  trustSub: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
});
