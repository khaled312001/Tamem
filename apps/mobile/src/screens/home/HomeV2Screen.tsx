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
import { HomeHeader } from './components/HomeHeader';
import { HomeSearchBar } from './components/HomeSearchBar';
import { HomeSkeleton } from './components/HomeSkeleton';
import { MainServicesSection, type HomeServiceItem } from './components/MainServicesSection';
import { OffersCarousel } from './components/OffersCarousel';
import { NearbyStoresSection, type StoreFilter } from './components/NearbyStoresSection';
import { PopularStoresSection } from './components/PopularStoresSection';
import { ProductRail } from './components/ProductRail';
import { PromoCardsRow } from './components/PromoCardsRow';
import { QuickActionsSection, type QuickAction } from './components/QuickActionsSection';
import type {
  HomeCategory,
  HomeProduct,
  Merchant,
  Offer,
  ServiceKey,
  ServiceRoute,
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

  const onPressCategory = useCallback(
    (c: HomeCategory) => {
      tick();
      navigation.navigate('StoresList', { categoryId: c.id });
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

  const goNearbyMap = useCallback(() => {
    tick();
    navigation.navigate('NearbyMap');
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
        />

        <View style={styles.section}>
          <HomeSearchBar
            onPress={() => setSearchOpen(true)}
            onPressVoice={() => {
              tick();
              setVoiceOpen(true);
            }}
          />
        </View>

        {isError && (
          <View style={[styles.section, styles.errorBox]}>
            <Text style={styles.errorText}>تعذّر تحميل بعض البيانات</Text>
            <Pressable onPress={refetchAll} style={styles.retryBtn} accessibilityRole="button">
              <Text style={styles.retryText}>إعادة المحاولة</Text>
            </Pressable>
          </View>
        )}

        {!!activeOrder && (
          <View style={styles.section}>
            <ActiveOrderCard order={activeOrder} onPress={goActiveOrder} />
          </View>
        )}

        {bannerOffers.length > 0 && (
          <View style={styles.section}>
            <OffersCarousel offers={bannerOffers} onPressOffer={onPressOffer} />
          </View>
        )}

        <View style={styles.section}>
          <MainServicesSection services={services} />
        </View>

        {/* Benefits sit directly under the services in the design, not at the
            bottom of the page. */}
        {homeConfig?.showTrustStrip !== false && (
          <View style={styles.section}>
            <BenefitsBar
              title={homeConfig?.trustStripTitle}
              subtitle={homeConfig?.trustStripSubtitle}
            />
          </View>
        )}

        {/* Admin-curated products. Renders nothing until someone pins some. */}
        <View style={styles.section}>
          <ProductRail
            title="الأكثر طلباً"
            products={featuredProducts}
            onPressProduct={onPressProduct}
          />
        </View>

        {/* Self-maintaining: appears only while something is actually on sale. */}
        <View style={styles.section}>
          <ProductRail
            title="عروض اليوم"
            subtitle="خصومات سارية الآن"
            products={dealProducts}
            onPressProduct={onPressProduct}
          />
        </View>

        <View style={styles.section}>
          <PopularStoresSection
            merchants={featuredMerchants}
            onPressMerchant={onPressMerchant}
            onPressSeeAll={goStores}
          />
        </View>

        <View style={styles.section}>
          <PromoCardsRow onPressTrack={goTracking} onPressFastDelivery={goFastDelivery} />
        </View>

        <View style={styles.section}>
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
        </View>

        {/* Not in the reference design, kept below the fold: both are live
            navigation paths (category browsing, wallet/favourites/coupons) that
            would otherwise be unreachable from home. */}
        <View style={styles.section}>
          <CategoriesSection
            categories={categories ?? []}
            merchants={nearbyMerchants}
            onPressCategory={onPressCategory}
            onPressSeeAll={goNearbyMap}
          />
        </View>

        <View style={styles.section}>
          <QuickActionsSection actions={quickActions} />
        </View>
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
  section: { marginTop: spacing.xl },

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
