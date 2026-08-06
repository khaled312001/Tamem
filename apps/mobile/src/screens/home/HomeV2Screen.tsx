/**
 * Home — V2 layout.
 *
 * A visual rebuild of HomeScreen against the new reference. Every byte of data,
 * every query key and every navigation target is the existing one: the screen
 * owns the data via `useHomeData()` and passes it down, so no child component
 * touches the network.
 *
 * Sections: header · search · active order · offers · services · stores ·
 * categories · quick actions · benefits · quick-order lamp.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Heart, Package, ShoppingBag, Ticket, Truck, Wallet } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SearchOverlay } from '../../components/home/SearchOverlay';
import { QuickOrderFAB } from '../../components/QuickOrderFAB';
import { QuickOrderSheet } from '../../components/QuickOrderSheet';
import { haptic } from '../../lib/haptics';
import { useUnreadCount } from '../../lib/useUnreadCount';
import type { HomeStackParamList } from '../../navigation/HomeStack';
import { colors, fontFamilies, radii, spacing } from '../../theme/tokens';

import { ActiveOrderCard } from './components/ActiveOrderCard';
import { BenefitsBar } from './components/BenefitsBar';
import { CategoriesSection } from './components/CategoriesSection';
import { SectionsSection, type HomeProductSection } from './components/SectionsSection';
import { HomeHeader } from './components/HomeHeader';
import { HomeSkeleton } from './components/HomeSkeleton';
import { MainServicesSection, type HomeServiceItem } from './components/MainServicesSection';
import { OffersCarousel } from './components/OffersCarousel';
import { NearbyStoresSection, type StoreFilter } from './components/NearbyStoresSection';
import { PopularStoresSection } from './components/PopularStoresSection';
import { ProductRail } from './components/ProductRail';
import { PromoCardsRow } from './components/PromoCardsRow';
import { QuickActionsSection, type QuickAction } from './components/QuickActionsSection';
import { SpotlightStoresSection } from './components/SpotlightStoresSection';
import {
  resolveHomeSections,
  type HomeCategory,
  type HomeProduct,
  type HomeSectionKey,
  Merchant,
  type Offer,
  type ServiceKey,
  type ServiceRoute,
} from './homeData';
import { useHomeData } from './useHomeData';

type NavProp = NativeStackNavigationProp<HomeStackParamList, 'Home'>;

/** key → icon + route. Mirrors the SERVICES list the old screen navigates with. */
const SERVICE_DEFS: { key: ServiceKey; Icon: typeof ShoppingBag; route: ServiceRoute }[] = [
  { key: 'delivery', Icon: ShoppingBag, route: 'DeliveryServices' },
  { key: 'shipping', Icon: Package, route: 'ShippingFlow' },
  { key: 'merchant', Icon: Truck, route: 'MerchantFlow' },
];

// Clears the tab bar (and later the floating button) at the end of the scroll.
const BOTTOM_GAP = 130;

/** Store cards rendered per "عرض المزيد" press. */
const STORES_PAGE = 6;

/** The seeded Category row id — matched case-insensitively against the name too,
 *  so renaming the category in the dashboard cannot empty the spotlight rail. */
const RESTAURANTS_CATEGORY_ID = 'restaurants';
/** How many restaurants the opening rail carries before "كل المطاعم". */
const SPOTLIGHT_MAX = 10;

export function HomeV2Screen() {
  const navigation = useNavigation<NavProp>();
  const [searchOpen, setSearchOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [storeFilter, setStoreFilter] = useState<StoreFilter>('all');
  // Grows on "عرض المزيد" so the first paint stays cheap on a long list.
  const [storesShown, setStoresShown] = useState(STORES_PAGE);
  // Same query key as the tab bar's bell — one fetch feeds both badges.
  const unreadCount = useUnreadCount();

  const {
    user,
    bannerOffers,
    featuredMerchants,
    featuredProducts,
    dealProducts,
    nearbyMerchants,
    merchantsTotal,
    hasLocation,
    categories,
    activeOrder,
    defaultAddress,
    needsAddress,
    homeConfig,
    isInitialLoading,
    isError,
    isRefreshing,
    refetchAll,
  } = useHomeData();

  const tick = useCallback(() => haptic.tap(), []);

  /**
   * The opening rail. Derived from the merchant list the screen already holds —
   * no second request, which is the whole reason it can sit above the fold.
   *
   * Open stores come first: a rail of closed restaurants is a worse first
   * impression than a shorter one. Within each group the incoming order is
   * kept, so a located user still gets the nearest first.
   */
  const pickRestaurants = useCallback(
    (city: string | null | undefined, exclude?: string | null) => {
      const want = city?.trim().toLowerCase() || null;
      const not = exclude?.trim().toLowerCase() || null;
      const isRestaurant = (m: Merchant) =>
        m.category?.id === RESTAURANTS_CATEGORY_ID || (m.category?.nameAr ?? '').trim() === 'مطاعم';
      const open: Merchant[] = [];
      const shut: Merchant[] = [];
      for (const m of nearbyMerchants) {
        if (!isRestaurant(m)) continue;
        const mCity = (m.city ?? '').trim().toLowerCase();
        if (want && mCity !== want) continue;
        if (not && mCity === not) continue;
        ((m.openness?.isOpenNow ?? m.isOpen) ? open : shut).push(m);
      }
      return [...open, ...shut].slice(0, SPOTLIGHT_MAX);
    },
    [nearbyMerchants],
  );

  // The opening rail. `spotlightCity` unset = every city, and the inter-city
  // stores are excluded so the same restaurant never sits in both rails.
  const spotlightRestaurants = useMemo(
    () => pickRestaurants(homeConfig?.spotlightCity, homeConfig?.intercityCity),
    [pickRestaurants, homeConfig?.spotlightCity, homeConfig?.intercityCity],
  );

  // Stores in another city that still deliver here. Hidden entirely until an
  // admin names that city in home settings.
  const intercityRestaurants = useMemo(
    () => (homeConfig?.intercityCity ? pickRestaurants(homeConfig.intercityCity) : []),
    [pickRestaurants, homeConfig?.intercityCity],
  );

  // ── navigation (identical targets to HomeScreen) ──
  const goNotifications = useCallback(() => {
    tick();
    navigation.getParent()?.navigate('Notifications' as never);
  }, [navigation, tick]);

  const goAddresses = useCallback(() => {
    tick();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigation.getParent() as any)?.navigate('ProfileTab', { screen: 'SavedAddresses' });
  }, [navigation, tick]);

  const goProfile = useCallback(() => {
    tick();
    navigation.getParent()?.navigate('ProfileTab' as never);
  }, [navigation, tick]);

  const goActiveOrder = useCallback(() => {
    if (!activeOrder) return;
    tick();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigation.getParent() as any)?.navigate('Orders', {
      screen: 'OrderTracking',
      params: { orderId: activeOrder.id },
    });
  }, [navigation, activeOrder, tick]);

  const onPressOffer = useCallback(
    (_offer: Offer) => {
      tick();
      // Offers funnel into the stores list, same as the old banner tap.
      navigation.navigate('StoresList');
    },
    [navigation, tick],
  );

  const onPressMerchant = useCallback(
    (m: Merchant) => {
      tick();
      navigation.navigate('MerchantDetail', { merchantId: m.id });
    },
    [navigation, tick],
  );

  const onPressProduct = useCallback(
    (p: HomeProduct) => {
      tick();
      navigation.navigate('ProductDetail', { productId: p.id });
    },
    [navigation, tick],
  );

  const goStores = useCallback(() => {
    tick();
    navigation.navigate('StoresList');
  }, [navigation, tick]);

  const goRestaurants = useCallback(() => {
    tick();
    navigation.navigate('StoresList', { categoryId: RESTAURANTS_CATEGORY_ID });
  }, [navigation, tick]);

  const goDeals = useCallback(() => {
    tick();
    navigation.navigate('Deals');
  }, [navigation, tick]);

  const onPressCategory = useCallback(
    (c: HomeCategory) => {
      tick();
      navigation.navigate('StoresList', { categoryId: c.id });
    },
    [navigation, tick],
  );

  const onPressSection = useCallback(
    (s: HomeProductSection) => {
      tick();
      // Opens StoresList directly in section mode: this section's items across
      // every merchant.
      navigation.navigate('StoresList', { section: s.nameAr });
    },
    [navigation, tick],
  );

  // "تتبع طلبك" — straight to the live order when there is one, otherwise to
  // the orders list so the card is never a dead end.
  const goTracking = useCallback(() => {
    tick();
    if (activeOrder) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigation.getParent() as any)?.navigate('Orders', {
        screen: 'OrderTracking',
        params: { orderId: activeOrder.id },
      });
      return;
    }
    navigation.getParent()?.navigate('Orders' as never);
  }, [navigation, activeOrder, tick]);

  // "توصيل سريع" — the delivery service flow, same target as the دليفري card.
  const goFastDelivery = useCallback(() => {
    tick();
    navigation.navigate('DeliveryServices');
  }, [navigation, tick]);

  // Shortcuts into screens that already exist under the Orders / Profile tabs.
  const quickActions = useMemo<QuickAction[]>(() => {
    const goProfileScreen = (screen: string) => () => {
      tick();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigation.getParent() as any)?.navigate('ProfileTab', { screen });
    };
    return [
      {
        key: 'orders',
        label: 'طلباتي',
        Icon: Package,
        tint: colors.brand.red,
        onPress: () => {
          tick();
          navigation.getParent()?.navigate('Orders' as never);
        },
      },
      {
        key: 'wallet',
        label: 'المحفظة',
        Icon: Wallet,
        tint: '#2E9E62',
        onPress: goProfileScreen('Wallet'),
      },
      {
        key: 'favorites',
        label: 'المفضلة',
        Icon: Heart,
        tint: '#E0301E',
        onPress: goProfileScreen('Favorites'),
      },
      {
        key: 'coupons',
        label: 'كوبوناتي',
        Icon: Ticket,
        tint: '#D49316',
        onPress: goProfileScreen('Coupons'),
      },
    ];
  }, [navigation, tick]);

  // Respect the admin's `visibleServiceKeys` exactly like the old screen.
  const services = useMemo<HomeServiceItem[]>(() => {
    const allowed = homeConfig?.visibleServiceKeys;
    const defs =
      allowed && allowed.length > 0
        ? SERVICE_DEFS.filter((s) => allowed.includes(s.key))
        : SERVICE_DEFS;
    return defs.map((s) => ({
      key: s.key,
      Icon: s.Icon,
      onPress: () => {
        tick();
        navigation.navigate(s.route);
      },
    }));
  }, [homeConfig?.visibleServiceKeys, navigation, tick]);

  const locationLabel = defaultAddress?.label ?? (needsAddress ? 'أضف عنوان' : 'اختر العنوان');

  // Admin-defined order + visibility (+ title override). Empty → built-in order.
  const sections = useMemo(
    () => resolveHomeSections(homeConfig?.sectionLayout),
    [homeConfig?.sectionLayout],
  );

  // One node per section key. Returns null when the section has no data to show
  // (empty rail, no live offer, trust strip toggled off) so it collapses fully.
  const renderSection = (key: HomeSectionKey, title?: string): React.ReactNode => {
    switch (key) {
      case 'spotlightRestaurants':
        return (
          <SpotlightStoresSection
            merchants={spotlightRestaurants}
            title={title || 'مطاعم قنا'}
            onPressMerchant={onPressMerchant}
            onPressSeeAll={goRestaurants}
          />
        );
      case 'intercityRestaurants':
        return (
          <SpotlightStoresSection
            merchants={intercityRestaurants}
            title={title || 'من قنا لحد باب بيتك'}
            subtitle={`${intercityRestaurants.length} مطعم في ${homeConfig?.intercityCity ?? ''} بيوصّلك`}
            onPressMerchant={onPressMerchant}
            onPressSeeAll={goRestaurants}
          />
        );
      case 'services':
        return <MainServicesSection services={services} overrides={homeConfig?.serviceCards} />;
      case 'offersSlider':
        return bannerOffers.length > 0 ? (
          <OffersCarousel offers={bannerOffers} onPressOffer={onPressOffer} />
        ) : null;
      case 'categories':
        return (
          <CategoriesSection
            categories={categories ?? []}
            merchants={nearbyMerchants}
            onPressCategory={onPressCategory}
            onPressSeeAll={goStores}
          />
        );
      case 'productSections':
        return <SectionsSection onPressSection={onPressSection} />;
      case 'featuredProducts':
        return (
          <ProductRail
            title={title || 'الأكثر طلباً'}
            products={featuredProducts}
            onPressProduct={onPressProduct}
          />
        );
      case 'deals':
        return (
          <ProductRail
            title={title || 'عروض اليوم'}
            subtitle="خصومات سارية الآن"
            products={dealProducts}
            onPressProduct={onPressProduct}
            onPressSeeAll={goDeals}
            onProductExpire={refetchAll}
          />
        );
      case 'popularStores':
        return (
          <PopularStoresSection
            merchants={featuredMerchants}
            onPressMerchant={onPressMerchant}
            onPressSeeAll={goStores}
          />
        );
      case 'nearbyStores':
        return (
          <NearbyStoresSection
            merchants={nearbyMerchants}
            total={merchantsTotal}
            hasLocation={hasLocation}
            filter={storeFilter}
            onChangeFilter={setStoreFilter}
            onPressMerchant={onPressMerchant}
            visibleCount={storesShown}
            onShowMore={() => setStoresShown((n) => n + STORES_PAGE)}
          />
        );
      case 'promoCards':
        return <PromoCardsRow onPressTrack={goTracking} onPressFastDelivery={goFastDelivery} />;
      case 'trustStrip':
        return homeConfig?.showTrustStrip !== false ? (
          <BenefitsBar
            title={homeConfig?.trustStripTitle}
            subtitle={homeConfig?.trustStripSubtitle}
          />
        ) : null;
      case 'quickActions':
        return <QuickActionsSection actions={quickActions} />;
      default:
        return null;
    }
  };

  if (isInitialLoading) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <HomeSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refetchAll}
            tintColor={colors.brand.red}
            colors={[colors.brand.red]}
          />
        }
      >
        <HomeHeader
          name={user?.name}
          avatarUrl={user?.avatarUrl}
          notificationCount={unreadCount}
          greetingOverride={homeConfig?.heroGreeting}
          subtitleOverride={homeConfig?.heroSubtitle}
          locationLabel={locationLabel}
          onPressAvatar={goProfile}
          onPressLocation={goAddresses}
          onPressNotifications={goNotifications}
          onPressSearch={() => setSearchOpen(true)}
          onPressVoice={() => {
            tick();
            setVoiceOpen(true);
          }}
        />

        {isError && (
          <View style={[styles.section, styles.errorBox]}>
            <Text style={styles.errorText}>تعذّر تحميل بعض البيانات</Text>
            <Pressable onPress={refetchAll} style={styles.retryBtn} accessibilityRole="button">
              <Text style={styles.retryText}>إعادة المحاولة</Text>
            </Pressable>
          </View>
        )}

        {/* The live-order card is contextual — it stays pinned above the
            reorderable list whenever an order is in flight. */}
        {!!activeOrder && (
          <View style={styles.section}>
            <ActiveOrderCard order={activeOrder} onPress={goActiveOrder} />
          </View>
        )}

        {/* Every other section renders in the admin's order + visibility
            (صفحة التطبيق › ترتيب الأقسام). An empty layout = the built-in order,
            and each section still collapses to nothing when it has no data. */}
        {sections.map(({ key, visible, title }) => {
          if (!visible) return null;
          const node = renderSection(key, title);
          if (!node) return null;
          return (
            <View key={key} style={styles.section}>
              {node}
            </View>
          );
        })}
      </ScrollView>

      {/* Self-positioned (absolute, bottom-start) — same lamp as the old home. */}
      <QuickOrderFAB />

      {/* Owns the TextInput, the 300ms debounce and the live suggestions. */}
      <SearchOverlay visible={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* The mic opens the existing voice-order flow directly. */}
      <QuickOrderSheet
        visible={voiceOpen}
        initialMode="voice"
        onClose={() => setVoiceOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: BOTTOM_GAP,
  },
  section: { marginTop: spacing.lg },

  errorBox: {
    borderRadius: radii.lg,
    backgroundColor: '#FDEAE2',
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorText: {
    fontSize: 14,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyBold,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.brand.red,
  },
  retryText: {
    color: colors.white,
    fontSize: 13,
    fontFamily: fontFamilies.bodyBold,
  },
});
