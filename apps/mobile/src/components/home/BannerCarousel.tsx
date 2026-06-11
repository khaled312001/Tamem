/**
 * BannerCarousel — horizontal pager of promotional banners shown on the
 * Home screen between the categories strip and the merchants list.
 *
 * Data: GET /offers — { id, title, titleAr, imageUrl, linkType, linkValue,
 * sortOrder }. The endpoint already filters by isActive and date window.
 *
 * Each banner is a 140-tall card with the image as the background and the
 * Arabic title overlaid on a dark gradient scrim for legibility regardless
 * of the image content. Pager dots reflect the current slide; we snap to
 * card width so the carousel never stops mid-banner.
 *
 * Navigation by linkType:
 *   SERVICE  → DynamicServiceFlow (linkValue is the service id)
 *   MERCHANT → MerchantDetail (linkValue is the merchant id)
 *   EXTERNAL → Linking.openURL (linkValue is an absolute https URL)
 *   NONE / unknown / missing linkValue → no-op (banner still tappable but
 *     swallowed silently — better than crashing on bad data)
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Sparkles } from 'lucide-react-native';
import { useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  Linking,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
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

interface Offer {
  id: string;
  title: string;
  titleAr: string;
  imageUrl?: string;
  linkType?: 'SERVICE' | 'MERCHANT' | 'EXTERNAL' | 'NONE';
  linkValue?: string | null;
  sortOrder?: number;
}

const BANNER_HEIGHT = 140;
const SCREEN_W = Dimensions.get('window').width;
// Card width = screen minus the HomeScreen's horizontal padding (spacing.lg
// on each side). Kept inline so we don't have to thread props.
const CARD_W = SCREEN_W - spacing.lg * 2;

export function BannerCarousel() {
  const navigation = useNavigation<NavProp>();
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const { data: offers, isLoading } = useQuery<Offer[]>({
    queryKey: ['home-offers'],
    queryFn: () => api.raw.get('/offers').then((r) => r.data.data),
    staleTime: 5 * 60_000,
  });

  // Nothing to show? Keep the slot collapsed rather than reserving 140px of
  // dead space — the surrounding margins on HomeScreen handle the gap.
  if (isLoading || !offers || offers.length === 0) return null;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Add half-a-card so the active index flips exactly when the next card
    // crosses the center of the viewport, not the leading edge.
    const next = Math.round(e.nativeEvent.contentOffset.x / (CARD_W + spacing.md));
    if (next !== activeIndex) setActiveIndex(next);
  };

  const handleTap = (o: Offer) => {
    haptic.tap();
    const value = (o.linkValue ?? '').trim();
    if (!value) return;
    switch (o.linkType) {
      case 'SERVICE':
        navigation.navigate('DynamicServiceFlow', { serviceId: value });
        return;
      case 'MERCHANT':
        navigation.navigate('MerchantDetail', { merchantId: value });
        return;
      case 'EXTERNAL':
        // Fire-and-forget — Linking rejects on malformed URLs but we
        // don't want to bother the user with a popup for a dead banner.
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
        // Snap to a card width + the gap between cards so each release
        // lands the next banner perfectly aligned with the left edge.
        snapToInterval={CARD_W + spacing.md}
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
      >
        {offers.map((o) => (
          <Pressable
            key={o.id}
            onPress={() => handleTap(o)}
            style={({ pressed }) => [
              styles.card,
              shadows.md,
              pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] },
            ]}
            accessibilityLabel={o.titleAr}
          >
            {o.imageUrl ? (
              <Image
                source={{ uri: o.imageUrl }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
            ) : (
              <LinearGradient
                colors={[colors.brand.red, colors.brand.orange]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            )}
            {/* Dark scrim — makes the title legible against any background
                while keeping the imagery dominant on the top half. */}
            <LinearGradient
              colors={['rgba(36,19,16,0)', 'rgba(36,19,16,0.78)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.cardBody}>
              <View style={styles.titleRow}>
                <Sparkles size={16} color={colors.brand.gold} />
                <Text style={styles.title} numberOfLines={2}>
                  {o.titleAr}
                </Text>
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      {offers.length > 1 && (
        <View style={styles.dotsRow}>
          {offers.map((o, i) => (
            <View
              key={o.id}
              style={[styles.dot, i === activeIndex ? styles.dotActive : styles.dotInactive]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.lg,
  },
  scrollContent: {
    gap: spacing.md,
    // No horizontal padding here — HomeScreen's scroll container already
    // applies spacing.lg, and adding it again would compound to 2× lg.
    paddingVertical: spacing.xs,
  },
  card: {
    width: CARD_W,
    height: BANNER_HEIGHT,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.soft,
  },
  cardBody: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    flex: 1,
    color: colors.white,
    fontFamily: fontFamilies.headingBlack,
    fontSize: fontSizes.lg,
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
  dotActive: {
    width: 18,
    backgroundColor: colors.brand.red,
  },
  dotInactive: {
    width: 6,
    backgroundColor: colors.line2,
  },
});
