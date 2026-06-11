/**
 * BannerCarousel — premium horizontal pager of promotional banners shown on
 * the Home screen between the categories strip and the merchants list.
 *
 * Key behaviour:
 *   - Multiple banners with auto-rotate every 3s (pauses while the user is
 *     dragging — restarts 1s after release).
 *   - Manual swipe / drag still works; the auto-pager just nudges to the
 *     next slide when idle.
 *   - Animated dot indicator below — active dot grows + uses brand red.
 *   - Falls back to a curated default set of 3 banners when /offers
 *     returns nothing (so the slot is never empty for a new install).
 *
 * Data: GET /offers — { id, title, titleAr, subtitleAr?, imageUrl,
 * linkType, linkValue, sortOrder, gradientColors? }.
 *
 * Navigation by linkType: SERVICE / MERCHANT / EXTERNAL / NONE.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Gift, Sparkles, Tag, Truck, type LucideIcon } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  Linking,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { api } from '../../lib/api';
import { haptic } from '../../lib/haptics';
import type { HomeStackParamList } from '../../navigation/HomeStack';
import { colors, fontFamilies, fontSizes, radii, shadows, spacing } from '../../theme/tokens';

type NavProp = NativeStackNavigationProp<HomeStackParamList, 'Home'>;

interface ServerOffer {
  id: string;
  title: string;
  titleAr: string;
  subtitleAr?: string;
  imageUrl?: string;
  linkType?: 'SERVICE' | 'MERCHANT' | 'EXTERNAL' | 'NONE';
  linkValue?: string | null;
  sortOrder?: number;
  gradient?: [string, string];
}

interface BannerSlide {
  id: string;
  titleAr: string;
  subtitleAr: string;
  ctaAr: string;
  badgeAr?: string;
  Icon: LucideIcon;
  gradient: [string, string];
  imageUrl?: string;
  linkType?: ServerOffer['linkType'];
  linkValue?: string | null;
}

/**
 * Default banners shown when the admin hasn't published any offers yet — keeps
 * the home screen visually rich on a fresh DB install. Each one carries the
 * brand's red-amber palette so the carousel feels like one cohesive surface.
 */
const DEFAULT_BANNERS: BannerSlide[] = [
  {
    id: 'default-tamem20',
    titleAr: 'كود التميم20',
    subtitleAr: 'خصم 20% على أول طلب لك بدون حد أدنى',
    ctaAr: 'استخدم الكود',
    badgeAr: 'لأول طلب',
    Icon: Gift,
    gradient: ['#FF6B5C', '#E0301E'],
  },
  {
    id: 'default-fast-delivery',
    titleAr: 'توصيل سريع جداً',
    subtitleAr: 'طلبك يصلك خلال 30 دقيقة فى قفط',
    ctaAr: 'اطلب الآن',
    badgeAr: 'سرعة قياسية',
    Icon: Truck,
    gradient: ['#FFB347', '#EC7A2C'],
  },
  {
    id: 'default-shipping',
    titleAr: 'شحن بين المحافظات',
    subtitleAr: 'طرود وبضائع بأقل الأسعار وأسرع توصيل',
    ctaAr: 'احجز شحنة',
    badgeAr: 'كل مصر',
    Icon: Tag,
    gradient: ['#FFD86F', '#F2A93B'],
  },
];

const PALETTE: Array<[string, string]> = [
  ['#FF6B5C', '#E0301E'],
  ['#FFB347', '#EC7A2C'],
  ['#FFD86F', '#F2A93B'],
  ['#FF8C9A', '#E0301E'],
  ['#FFA76D', '#E0301E'],
];

function offerToSlide(o: ServerOffer, idx: number): BannerSlide {
  return {
    id: o.id,
    titleAr: o.titleAr,
    subtitleAr: o.subtitleAr ?? 'اطلع على التفاصيل',
    ctaAr: 'اكتشف العرض',
    Icon: Sparkles,
    gradient: o.gradient ?? PALETTE[idx % PALETTE.length]!,
    imageUrl: o.imageUrl,
    linkType: o.linkType,
    linkValue: o.linkValue,
  };
}

const BANNER_HEIGHT = 168;
const SCREEN_W = Dimensions.get('window').width;
const CARD_W = SCREEN_W - spacing.lg * 2;
const SNAP = CARD_W + spacing.md;
const AUTO_ROTATE_MS = 3000;

export function BannerCarousel() {
  const navigation = useNavigation<NavProp>();
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // We pause auto-rotate while the user is interacting + briefly after
  // they let go so the carousel never yanks a card out from under their
  // thumb mid-read.
  const userInteractingRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: offers } = useQuery<ServerOffer[]>({
    queryKey: ['home-offers'],
    queryFn: () => api.raw.get('/offers').then((r) => r.data.data),
    staleTime: 5 * 60_000,
  });

  // Build the slide list — prefer server offers, fall back to defaults.
  const slides: BannerSlide[] =
    offers && offers.length > 0 ? offers.map(offerToSlide) : DEFAULT_BANNERS;

  // Auto-rotate. Disabled when there's only one slide (no rotation makes
  // sense) and when the user is mid-drag.
  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => {
      if (userInteractingRef.current) return;
      const next = (activeIndex + 1) % slides.length;
      scrollRef.current?.scrollTo({ x: next * SNAP, animated: true });
      setActiveIndex(next);
    }, AUTO_ROTATE_MS);
    return () => clearInterval(timer);
  }, [activeIndex, slides.length]);

  const pauseAutoRotate = () => {
    userInteractingRef.current = true;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
  };
  const resumeAutoRotate = () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      userInteractingRef.current = false;
    }, 1000);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / SNAP);
    if (next !== activeIndex) setActiveIndex(next);
  };

  const handleTap = (b: BannerSlide) => {
    haptic.tap();
    const value = (b.linkValue ?? '').trim();
    if (!value) return;
    switch (b.linkType) {
      case 'SERVICE':
        navigation.navigate('DynamicServiceFlow', { serviceId: value });
        return;
      case 'MERCHANT':
        navigation.navigate('MerchantDetail', { merchantId: value });
        return;
      case 'EXTERNAL':
        void Linking.openURL(value).catch(() => undefined);
        return;
      default:
        return;
    }
  };

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled={false}
        showsHorizontalScrollIndicator={false}
        snapToInterval={SNAP}
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={pauseAutoRotate}
        onScrollEndDrag={resumeAutoRotate}
        onMomentumScrollEnd={resumeAutoRotate}
        contentContainerStyle={styles.scrollContent}
      >
        {slides.map((b, idx) => (
          <BannerCard
            key={b.id}
            banner={b}
            onPress={() => handleTap(b)}
            isActive={idx === activeIndex}
          />
        ))}
      </ScrollView>

      {slides.length > 1 && (
        <View style={styles.dotsRow}>
          {slides.map((b, i) => (
            <AnimatedDot key={b.id} active={i === activeIndex} />
          ))}
        </View>
      )}
    </View>
  );
}

function BannerCard({
  banner,
  onPress,
  isActive,
}: {
  banner: BannerSlide;
  onPress: () => void;
  isActive: boolean;
}) {
  const scale = useRef(new Animated.Value(0.96)).current;
  const useNative = Platform.OS !== 'web';
  useEffect(() => {
    Animated.timing(scale, {
      toValue: isActive ? 1 : 0.96,
      duration: 280,
      useNativeDriver: useNative,
    }).start();
  }, [isActive, scale, useNative]);

  const { Icon } = banner;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, shadows.md, pressed && { opacity: 0.92 }]}
        accessibilityLabel={banner.titleAr}
      >
        {/* Background — image when admin uploaded one, otherwise the brand
            gradient. Either way we layer a dark scrim on top for legibility. */}
        {banner.imageUrl ? (
          <Image
            source={{ uri: banner.imageUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <LinearGradient
            colors={banner.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}

        {/* Decorative pattern — subtle gold rings in the corners that read
            as "premium" without competing with the headline. */}
        <View style={[styles.ring, styles.ringTop]} />
        <View style={[styles.ring, styles.ringBottom]} />

        {/* Top-right badge — short callout (e.g. "خصم 20%") */}
        {banner.badgeAr ? (
          <View style={styles.badge}>
            <Sparkles size={11} color={colors.brand.gold} />
            <Text style={styles.badgeText}>{banner.badgeAr}</Text>
          </View>
        ) : null}

        {/* Bottom-left content stack */}
        <View style={styles.content}>
          <View style={styles.iconBubble}>
            <Icon size={20} color={colors.white} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              {banner.titleAr}
            </Text>
            <Text style={styles.subtitle} numberOfLines={2}>
              {banner.subtitleAr}
            </Text>
          </View>
          <View style={styles.cta}>
            <Text style={styles.ctaText}>{banner.ctaAr}</Text>
            <ArrowLeft size={14} color={colors.brand.red} strokeWidth={2.6} />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function AnimatedDot({ active }: { active: boolean }) {
  const width = useRef(new Animated.Value(active ? 22 : 6)).current;
  const useNative = false; // animating width — can't use the native driver
  useEffect(() => {
    Animated.timing(width, {
      toValue: active ? 22 : 6,
      duration: 240,
      useNativeDriver: useNative,
    }).start();
  }, [active, width]);
  return (
    <Animated.View
      style={[styles.dot, { width, backgroundColor: active ? colors.brand.red : colors.line2 }]}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.lg },
  scrollContent: {
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  card: {
    width: CARD_W,
    height: BANNER_HEIGHT,
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: colors.soft,
    position: 'relative',
  },
  ring: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  ringTop: {
    width: 120,
    height: 120,
    top: -60,
    end: -40,
  },
  ringBottom: {
    width: 80,
    height: 80,
    bottom: -30,
    start: -20,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  badge: {
    position: 'absolute',
    top: spacing.md,
    end: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  badgeText: { color: colors.white, fontFamily: fontFamilies.bodyExtraBold, fontSize: 10 },
  content: {
    position: 'absolute',
    insetInlineStart: 0,
    insetInlineEnd: 0,
    bottom: 0,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
  },
  title: {
    color: colors.white,
    fontFamily: fontFamilies.headingBlack,
    fontSize: fontSizes.md,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.88)',
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    marginTop: 2,
    lineHeight: 16,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  ctaText: {
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: 11,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
});
