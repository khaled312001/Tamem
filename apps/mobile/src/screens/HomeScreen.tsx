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
  ShoppingBag,
  Store,
  Truck,
} from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HeartButton } from '../components/HeartButton';
import { QuickOrderFAB } from '../components/QuickOrderFAB';
import {
  AnimatedListItem,
  Badge,
  ForwardChevron,
  MerchantSkeleton,
  Rating,
  SearchBar,
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
  promoBannerTitle: string | null;
  promoBannerCode: string | null;
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
  const [searchValue, setSearchValue] = useState('');

  const submitSearch = () => {
    const q = searchValue.trim();
    if (!q) return;
    navigation.navigate('NearbyMap', { search: q });
  };

  const onPromo = async () => {
    const code = topOffer?.code || FALLBACK_PROMO_CODE;
    const copied = await copyToClipboard(code);
    Alert.alert(
      copied ? 'تم نسخ الكود ✓' : `كود الخصم: ${code}`,
      copied
        ? `استخدم "${code}" عند تأكيد طلبك للحصول على الخصم.`
        : 'انسخه واستخدمه عند تأكيد الطلب.',
    );
  };

  const { data: offers } = useQuery<Offer[]>({
    queryKey: ['offers'],
    queryFn: () => api.raw.get('/offers').then((r) => r.data.data),
  });

  const { data: merchants, isLoading: loadingMerchants } = useQuery<Merchant[]>({
    queryKey: ['merchants'],
    queryFn: () => api.raw.get('/merchants').then((r) => r.data.data),
  });

  const { data: myOrders } = useQuery<ActiveOrder[]>({
    queryKey: ['orders-mine'],
    queryFn: () => api.raw.get('/orders/mine').then((r) => r.data.data),
  });

  // Saved addresses — used to (1) drive the location row in the hero so it
  // shows the customer's actual default rather than "قفط — قنا" hardcoded,
  // and (2) surface a banner if they haven't saved any yet (because the
  // backend will refuse to create orders without one).
  const { data: addresses } = useQuery<SavedAddress[]>({
    queryKey: ['my-addresses'],
    queryFn: () => api.raw.get('/me/addresses').then((r) => r.data.data),
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
        <View style={styles.heroRow}>
          <Pressable
            onPress={() => {
              tickHaptic();
              // Tapping the location row now takes the customer to manage
              // their saved addresses — that's the source of truth.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (navigation.getParent() as any)?.navigate('ProfileTab', {
                screen: 'SavedAddresses',
              });
            }}
            style={({ pressed }) => [styles.locationBtn, pressed && { opacity: 0.85 }]}
            accessibilityLabel="تغيير العنوان"
          >
            <View style={styles.locationLabelRow}>
              <Text style={styles.locationLabel}>
                {needsAddress ? 'لازم تسجّل عنوان' : 'التوصيل إلى'}
              </Text>
              <ChevronDown size={14} color="rgba(255,255,255,0.85)" />
            </View>
            <View style={styles.locationValueRow}>
              <MapPin size={14} color={colors.white} />
              <Text style={styles.locationValue} numberOfLines={1}>
                {defaultAddress
                  ? `${defaultAddress.label} · ${defaultAddress.address}`
                  : 'اضغط هنا لإضافة عنوان'}
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => {
              tickHaptic();
              navigation.getParent()?.navigate('Notifications' as never);
            }}
            style={({ pressed }) => [styles.heroIconBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel="الإشعارات"
            hitSlop={6}
          >
            <Bell size={18} color={colors.white} />
            <View style={styles.bellDot} />
          </Pressable>
        </View>

        <Text style={styles.heroGreeting}>
          {homeConfig?.heroGreeting ?? `أهلاً ${user?.name?.split(' ')[0] ?? 'بك'} 👋`}
        </Text>
        <Text style={styles.heroSubtitle}>
          {homeConfig?.heroSubtitle ?? 'ايه اللي محتاج توصيله النهارده؟'}
        </Text>

        <View style={styles.searchOuter}>
          <SearchBar
            value={searchValue}
            onChangeText={setSearchValue}
            onSubmit={submitSearch}
            placeholder="ابحث عن مطعم، محل، أو منتج…"
          />
        </View>
      </LinearGradient>

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

        {/* ─────── Promo banner — hidden when admin toggled off ─────── */}
        {(homeConfig?.showPromoBanner ?? true) && (topOffer || homeConfig?.promoBannerTitle) && (
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
                <Text style={styles.bannerTitle}>
                  {homeConfig?.promoBannerTitle ?? topOffer?.titleAr ?? ''}
                </Text>
                <Text style={styles.bannerSub}>
                  كود الخصم:{' '}
                  <Text style={styles.bannerCode}>
                    {homeConfig?.promoBannerCode || topOffer?.code || FALLBACK_PROMO_CODE}
                  </Text>
                </Text>
              </View>
              <View style={styles.bannerCopy}>
                <Copy size={14} color={colors.brand.dark} />
              </View>
            </LinearGradient>
          </Pressable>
        )}

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
                <Badge tone={m.isOpen ? 'success' : 'neutral'} size="sm">
                  {m.isOpen ? 'مفتوح' : 'مغلق'}
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radii.xxl,
    borderBottomRightRadius: radii.xxl,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  locationBtn: {
    flex: 1,
    paddingVertical: 4,
  },
  locationLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
  },
  locationValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  locationValue: {
    color: colors.white,
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.md,
  },
  heroIconBtn: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  bellDot: {
    position: 'absolute',
    top: 9,
    end: 10,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.brand.gold,
  },
  heroGreeting: {
    color: colors.white,
    fontSize: fontSizes.xl,
    fontFamily: fontFamilies.headingBlack,
    marginTop: spacing.md,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.body,
    marginTop: 2,
  },
  searchOuter: { marginTop: spacing.lg },
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
