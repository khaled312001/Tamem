import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
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
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HeartButton } from '../components/HeartButton';
import { QuickOrderFAB } from '../components/QuickOrderFAB';
import {
  AnimatedListItem,
  ForwardChevron,
  MerchantSkeleton,
  SectionHeader,
  ServiceTile,
  StatusPill,
} from '../components/ui';
import { api } from '../lib/api';
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
  imageUrl: string;
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

const PROMO_CODE = 'TAMEM20';

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

const tickHaptic = () => {
  if (Platform.OS !== 'web') void Haptics.selectionAsync();
};

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
    const copied = await copyToClipboard(PROMO_CODE);
    Alert.alert(
      copied ? 'تم نسخ الكود ✓' : `كود الخصم: ${PROMO_CODE}`,
      copied
        ? `استخدم "${PROMO_CODE}" عند تأكيد طلبك للحصول على خصم 20%.`
        : 'انسخه واستخدمه عند تأكيد الطلب — خصم 20% على أول طلب.',
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

  const activeOrder = (myOrders ?? []).find((o) => ACTIVE_STATUSES.includes(o.status));
  const topOffer = offers?.[0];
  const featuredMerchants = merchants?.slice(0, 4) ?? [];

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* ─────── Branded hero with location + bell ─────── */}
      <LinearGradient
        colors={gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroRow}>
          <Pressable
            onPress={() => {
              tickHaptic();
              navigation.navigate('NearbyMap', { search: '' });
            }}
            style={({ pressed }) => [styles.locationBtn, pressed && { opacity: 0.85 }]}
            accessibilityLabel="تغيير العنوان"
          >
            <View style={styles.locationLabelRow}>
              <Text style={styles.locationLabel}>التوصيل إلى</Text>
              <ChevronDown size={14} color="rgba(255,255,255,0.85)" />
            </View>
            <View style={styles.locationValueRow}>
              <MapPin size={14} color={colors.white} />
              <Text style={styles.locationValue} numberOfLines={1}>
                قفط — قنا
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

        <Text style={styles.heroGreeting}>أهلاً {user?.name?.split(' ')[0] ?? 'بك'} 👋</Text>
        <Text style={styles.heroSubtitle}>ايه اللي محتاج توصيله النهارده؟</Text>

        <View style={styles.searchWrap}>
          <Search size={18} color={colors.text.muted} />
          <TextInput
            value={searchValue}
            onChangeText={setSearchValue}
            onSubmitEditing={submitSearch}
            returnKeyType="search"
            placeholder="ابحث عن مطعم، محل، أو منتج…"
            placeholderTextColor={colors.text.muted}
            style={styles.searchInput}
          />
          {searchValue.length > 0 && (
            <Pressable onPress={submitSearch} hitSlop={8} style={styles.searchGo}>
              <ForwardChevron size={18} color={colors.brand.red} />
            </Pressable>
          )}
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
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
          {SERVICES.map((s) => (
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

        {/* ─────── Promo banner ─────── */}
        {topOffer && (
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
                <Text style={styles.bannerTitle}>{topOffer.titleAr}</Text>
                <Text style={styles.bannerSub}>
                  كود الخصم: <Text style={styles.bannerCode}>{PROMO_CODE}</Text>
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
                    <Text style={styles.merchantMetaStar}>★</Text>
                    <Text style={styles.merchantMetaText}>{Number(m.rating ?? 0).toFixed(1)}</Text>
                    <Text style={styles.merchantMetaDot}>·</Text>
                    <Text style={styles.merchantMetaText}>{m.category?.nameAr ?? '—'}</Text>
                  </View>
                </View>
                <View style={m.isOpen ? styles.openTag : styles.closedTag}>
                  <Text style={m.isOpen ? styles.openTagText : styles.closedTagText}>
                    {m.isOpen ? 'مفتوح' : 'مغلق'}
                  </Text>
                </View>
                <HeartButton merchantId={m.id} merchantName={m.storeNameAr} size="sm" />
              </Pressable>
            </AnimatedListItem>
          ))
        )}

        {/* ─────── Trust strip ─────── */}
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
            <Text style={styles.trustTitle}>توصيل سريع خلال 30 دقيقة</Text>
            <Text style={styles.trustSub}>داخل مدينة قفط — للطلبات القريبة</Text>
          </View>
        </LinearGradient>
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
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginTop: spacing.lg,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.body,
    color: colors.text.primary,
    textAlign: 'right',
  },
  searchGo: {
    backgroundColor: colors.brand.redLight,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Scroll content
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
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
    gap: 4,
    marginTop: 2,
  },
  merchantMetaStar: {
    fontSize: 12,
    color: colors.brand.gold,
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
  openTag: {
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  openTagText: {
    color: colors.success,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: 10,
  },
  closedTag: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  closedTagText: {
    color: colors.text.muted,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: 10,
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
