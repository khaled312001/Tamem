import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import {
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

import { AnimatedListItem } from '../components/AnimatedListItem';
import { GradientHeader } from '../components/GradientHeader';
import { QuickOrderFAB } from '../components/QuickOrderFAB';
import { CardListSkeleton } from '../components/Skeleton';
import { api } from '../lib/api';
import type { HomeStackParamList } from '../navigation/HomeStack';
import { useAuth } from '../stores/auth';
import { colors, fontFamilies, fontSizes, gradients, radii, spacing } from '../theme/tokens';

const tickHaptic = () => {
  if (Platform.OS !== 'web') void Haptics.selectionAsync();
};

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

const SERVICES = [
  {
    key: 'delivery',
    label: 'دليفري',
    sub: 'داخل المدينة',
    Icon: ShoppingBag,
    color: gradients.brand,
    route: 'DeliveryServices' as const,
  },
  {
    key: 'shipping',
    label: 'شحن',
    sub: 'بين المناطق',
    Icon: Package,
    color: gradients.brandGold,
    route: 'ShippingFlow' as const,
  },
  {
    key: 'merchant',
    label: 'تاجر',
    sub: 'طلبات جملة',
    Icon: Store,
    color: gradients.brandGold,
    route: 'MerchantFlow' as const,
  },
] as const;

const PROMO_CODE = 'TAMEM20';

async function copyCode(text: string) {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}

export function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const user = useAuth((s) => s.user);
  const [searchValue, setSearchValue] = useState('');

  const submitSearch = () => {
    const q = searchValue.trim();
    if (!q) return;
    navigation.navigate('NearbyMap', { search: q });
  };

  const onPromoPress = async () => {
    const ok = await copyCode(PROMO_CODE);
    Alert.alert(
      ok ? 'تم نسخ الكود ✓' : `كود الخصم: ${PROMO_CODE}`,
      ok
        ? `كود "${PROMO_CODE}" اتنسخ. ضيفه عند تأكيد طلبك للحصول على خصم 20%.`
        : 'انسخه واستخدمه عند الطلب للحصول على خصم 20% على أول طلب.',
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

  const topOffer = offers?.[0];
  const topMerchants = merchants?.slice(0, 3) ?? [];

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <GradientHeader
        greeting={`أهلاً ${user?.name?.split(' ')[0] ?? 'بك'}`}
        location="قفط — قنا"
        hasNotifications
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.searchWrap}>
          <Pressable onPress={submitSearch} hitSlop={8}>
            <Search size={16} color={colors.text.muted} />
          </Pressable>
          <TextInput
            value={searchValue}
            onChangeText={setSearchValue}
            onSubmitEditing={submitSearch}
            returnKeyType="search"
            placeholder="ابحث عن مطعم، محل، أو منتج…"
            placeholderTextColor={colors.text.muted}
            style={styles.searchInput}
          />
        </View>

        {topOffer && (
          <Pressable onPress={onPromoPress}>
            <LinearGradient
              colors={gradients.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.banner}
            >
              <View style={styles.bannerIcon}>
                <Gift size={20} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerTitle}>{topOffer.titleAr}</Text>
                <Text style={styles.bannerSub}>استخدم كود {PROMO_CODE} — لفترة محدودة</Text>
              </View>
              <View style={styles.bannerCopy}>
                <Copy size={14} color={colors.white} />
              </View>
            </LinearGradient>
          </Pressable>
        )}

        <Text style={styles.sectionTitle}>خدماتنا</Text>
        <View style={styles.services}>
          {SERVICES.map(({ key, label, sub, Icon, color, route }) => (
            <Pressable
              key={key}
              onPress={() => {
                tickHaptic();
                navigation.navigate(route);
              }}
              style={({ pressed }) => [styles.serviceCard, pressed && styles.pressed]}
            >
              <LinearGradient
                colors={color}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.serviceIcon}
              >
                <Icon size={20} color={colors.white} />
              </LinearGradient>
              <Text style={styles.serviceLabel}>{label}</Text>
              <Text style={styles.serviceSub}>{sub}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>الأكثر طلبًا</Text>
          <Pressable
            onPress={() => navigation.navigate('NearbyMap', { search: '' })}
            style={({ pressed }) => [styles.mapLink, pressed && { opacity: 0.85 }]}
          >
            <MapPin size={14} color={colors.brand.red} />
            <Text style={styles.mapLinkText}>عرض على الخريطة</Text>
          </Pressable>
        </View>
        {loadingMerchants ? (
          <CardListSkeleton count={3} />
        ) : topMerchants.length === 0 ? (
          <Text style={styles.empty}>لا توجد متاجر بعد</Text>
        ) : (
          topMerchants.map((m, i) => (
            <AnimatedListItem key={m.id} index={i}>
              <Pressable
                onPress={() => navigation.navigate('MerchantDetail', { merchantId: m.id })}
                style={({ pressed }) => [styles.merchantCard, pressed && styles.pressed]}
              >
                <View style={styles.merchantIcon}>
                  <Store size={20} color={colors.brand.red} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.merchantName}>{m.storeNameAr}</Text>
                  <Text style={styles.merchantSub}>
                    ⭐ {Number(m.rating ?? 0).toFixed(1)} · {m.category?.nameAr ?? '—'}
                  </Text>
                </View>
                <View style={m.isOpen ? styles.tagOpen : styles.tagClosed}>
                  <Text style={m.isOpen ? styles.tagOpenText : styles.tagClosedText}>
                    {m.isOpen ? 'مفتوح' : 'مغلق'}
                  </Text>
                </View>
              </Pressable>
            </AnimatedListItem>
          ))
        )}

        <View style={styles.darkStrip}>
          <LinearGradient
            colors={gradients.brandGold}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.darkStripIcon}
          >
            <Truck size={16} color={colors.brand.dark} />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={styles.darkStripTitle}>توصيل سريع خلال 30 دقيقة</Text>
            <Text style={styles.darkStripSub}>داخل مدينة قفط — للطلبات القريبة</Text>
          </View>
        </View>
      </ScrollView>

      <QuickOrderFAB />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, paddingTop: spacing.md },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.body,
    color: colors.text.primary,
    textAlign: 'right',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: {
    color: colors.white,
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.headingBold,
  },
  bannerSub: {
    color: colors.white,
    fontSize: fontSizes.xs,
    opacity: 0.92,
    marginTop: 2,
    fontFamily: fontFamilies.body,
  },
  bannerCopy: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  mapLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brand.redLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  mapLinkText: {
    fontSize: fontSizes.xs,
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  sectionTitle: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.headingBlack,
    color: colors.ink,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  services: { flexDirection: 'row-reverse', gap: spacing.sm, marginBottom: spacing.md },
  serviceCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  serviceIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  serviceLabel: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.headingBold,
    color: colors.ink,
  },
  serviceSub: {
    fontSize: 10,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    marginTop: 2,
  },
  pressed: { opacity: 0.85 },
  empty: {
    color: colors.text.muted,
    textAlign: 'center',
    padding: spacing.lg,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
  },
  merchantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  merchantIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  merchantName: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
  },
  merchantSub: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    marginTop: 2,
  },
  tagOpen: {
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  tagOpenText: {
    color: colors.success,
    fontSize: 10,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  tagClosed: {
    backgroundColor: '#F3F3F3',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  tagClosedText: {
    color: colors.text.muted,
    fontSize: 10,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  darkStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.brand.dark,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  darkStripIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  darkStripTitle: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  darkStripSub: {
    color: colors.white,
    opacity: 0.7,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.body,
    marginTop: 2,
  },
});
