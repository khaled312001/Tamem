import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Bell,
  ChevronDown,
  Copy,
  Gift,
  MapPin,
  Package,
  Search,
  ShoppingBag,
  Store,
  Truck,
} from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HeartButton } from '../components/HeartButton';
import { QuickOrderFAB } from '../components/QuickOrderFAB';
import { BannerCarousel } from '../components/home/BannerCarousel';
import { CategoriesStrip } from '../components/home/CategoriesStrip';
import { SearchOverlay } from '../components/home/SearchOverlay';
import {
  AnimatedListItem,
  Badge,
  ForwardChevron,
  MerchantSkeleton,
  Rating,
  SectionHeader,
  ServiceTile,
  StatusPill,
} from '../components/ui';
import { api } from '../lib/api';
import { copyToClipboard } from '../lib/clipboard';
import { haptic } from '../lib/haptics';
import type { HomeStackParamList } from '../navigation/HomeStack';
import { useAuth } from '../stores/auth';
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

const ACTIVE_STATUSES: OrderStatus[] = [
  'NEW',
  'UNDER_REVIEW',
  'PRICED',
  'AWAITING_CUSTOMER_APPROVAL',
  'ACCEPTED',
  'DRIVER_ASSIGNED',
  'PICKED_UP',
  'IN_ROUTE',
];

// Fallback when the backend hasn't returned a real code on the offer.
const FALLBACK_PROMO_CODE = 'TAMEM20';

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

  // Resolve the gradient: server-provided > brand default. We tuple it so
  // LinearGradient is happy.
  const heroGradient = (
    homeConfig?.heroGradient && homeConfig.heroGradient.length >= 2
      ? homeConfig.heroGradient
      : (gradients.brand as readonly string[])
  ) as readonly [string, string, ...string[]];

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
      {/* ─────── Branded hero with location + bell ─────── */}
      <LinearGradient
        colors={heroGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        {/* Top toolbar: logo + greeting + bell */}
        <View style={styles.toolbar}>
          <View style={styles.brandWrap}>
            <View style={styles.brandLogoCircle}>
              <Image
                source={require('../assets/logo.jpg')}
                style={styles.brandLogo}
                resizeMode="cover"
              />
            </View>
            <Text style={styles.brandName}>تميم</Text>
          </View>

          <Text style={styles.greeting} numberOfLines={1}>
            أهلاً {user?.name?.split(' ')[0] ?? 'بك'} 👋
          </Text>

          <Pressable
            onPress={() => {
              tickHaptic();
              navigation.getParent()?.navigate('Notifications' as never);
            }}
            style={({ pressed }) => [styles.bellBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel="الإشعارات"
            hitSlop={6}
          >
            <Bell size={16} color={colors.white} />
            <View style={styles.bellDot} />
          </Pressable>
        </View>

        {/* Compact location pill — taps open SavedAddresses */}
        <Pressable
          onPress={() => {
            tickHaptic();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (navigation.getParent() as any)?.navigate('ProfileTab', {
              screen: 'SavedAddresses',
            });
          }}
          style={({ pressed }) => [styles.locationPill, pressed && { opacity: 0.9 }]}
          accessibilityLabel="تغيير العنوان"
        >
          <MapPin size={14} color={colors.white} />
          <Text style={styles.locationPillText} numberOfLines={1}>
            {defaultAddress
              ? `${defaultAddress.label} · ${defaultAddress.address}`
              : needsAddress
                ? 'اضغط لإضافة عنوان توصيل'
                : 'اختر عنوان التوصيل'}
          </Text>
          <ChevronDown size={14} color="rgba(255,255,255,0.9)" />
        </Pressable>

        {/* Collapsed search pill — opens the SearchOverlay (which auto-
            focuses an input + shows live suggestions). */}
        <Pressable
          onPress={() => setSearchOpen(true)}
          style={({ pressed }) => [styles.searchPill, pressed && { opacity: 0.92 }]}
          accessibilityRole="search"
          accessibilityLabel="افتح البحث"
        >
          <Search size={18} color={colors.text.muted} />
          <Text style={styles.searchPillText} numberOfLines={1}>
            ابحث عن مطعم، محل، أو منتج…
          </Text>
        </Pressable>
      </LinearGradient>

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

        {/* ─────── Services ─────── */}
        <SectionHeader title="خدماتنا" subtitle="اختر نوع الطلب المناسب لك" compact />
        <View style={styles.servicesRow}>
          {visibleServices.map((s) => (
            <ServiceTile
              key={s.key}
              label={s.label}
              sublabel={s.sub}
              Icon={s.Icon}
              gradient={s.gradient}
              onPress={() => {
                tickHaptic();
                navigation.navigate(s.route);
              }}
            />
          ))}
        </View>

        {/* ─────── Promo banner — admin-controlled. Source priority:
              1. promoCoupon (admin picked from Coupons table — preferred)
              2. promoBannerTitle/Code (manual override)
              3. topOffer (legacy Offers table)
              4. nothing → banner hidden ─────── */}
        {(() => {
          if (!(homeConfig?.showPromoBanner ?? true)) return null;
          const coupon = homeConfig?.promoCoupon;
          const couponTitle = coupon
            ? coupon.description ||
              (coupon.type === 'PERCENTAGE'
                ? `خصم ${Number(coupon.value)}% على طلبك`
                : `خصم ${Number(coupon.value)} ج.م على طلبك`)
            : null;
          const title = couponTitle ?? homeConfig?.promoBannerTitle ?? topOffer?.titleAr ?? null;
          const code = coupon?.code ?? homeConfig?.promoBannerCode ?? topOffer?.code ?? null;
          if (!title && !code) return null;
          return (
            <Pressable onPress={onPromo} style={({ pressed }) => [pressed && { opacity: 0.92 }]}>
              <LinearGradient
                colors={gradients.promo}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.banner, shadows.md]}
              >
                <View style={styles.bannerIcon}>
                  <Gift size={22} color={colors.brand.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bannerTitle}>{title ?? ''}</Text>
                  <Text style={styles.bannerSub}>
                    كود الخصم: <Text style={styles.bannerCode}>{code ?? FALLBACK_PROMO_CODE}</Text>
                  </Text>
                </View>
                <View style={styles.bannerCopy}>
                  <Copy size={14} color={colors.brand.dark} />
                </View>
              </LinearGradient>
            </Pressable>
          );
        })()}

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
  // Hero
  hero: {
    // Redesigned hero: 3 stacked rows (toolbar / location pill / search
    // pill). ~140px total, logo in the corner, no decorative subtitle.
    paddingHorizontal: spacing.md,
    paddingTop: 4,
    paddingBottom: spacing.sm,
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
    gap: spacing.sm,
  },
  // ── Row 1: brand + greeting + bell ──
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  brandWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandLogoCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 2,
  },
  brandLogo: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  brandName: {
    color: colors.white,
    fontFamily: fontFamilies.headingBlack,
    fontSize: fontSizes.sm,
    letterSpacing: 0.3,
  },
  greeting: {
    flex: 1,
    textAlign: 'center',
    color: colors.white,
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.sm,
  },
  bellBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  bellDot: {
    position: 'absolute',
    top: 6,
    end: 6,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.brand.gold,
  },
  // ── Row 2: location pill ──
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 99,
  },
  locationPillText: {
    flex: 1,
    color: colors.white,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
    textAlign: 'right',
  },
  // ── Row 3: search pill ──
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 42,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
    borderRadius: 99,
  },
  searchPillText: {
    flex: 1,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
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
