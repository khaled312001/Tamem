/**
 * Offers banner.
 *
 * The old banner composited a small artwork inside a gradient card, which is
 * why the image looked shrunken inside a second background. Here each slide is
 * the API image and nothing else: one full-bleed <Image resizeMode="cover"> at
 * the design's 1600×600 ratio. Text is only drawn when an offer has NO image,
 * so a banner that already contains its own artwork/copy is never doubled up.
 */
import { memo, useCallback, useRef, useState } from 'react';
import {
  FlatList,
  I18nManager,
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { colors, fontFamilies, radii, shadows, spacing } from '../../../theme/tokens';
import type { Offer } from '../homeData';

const BANNER_RATIO = 1600 / 600;
const H_PADDING = spacing.lg; // screen padding on each side

interface Props {
  offers: Offer[];
  onPressOffer: (offer: Offer) => void;
}

function OffersCarouselBase({ offers, onPressOffer }: Props) {
  const { width } = useWindowDimensions();
  const bannerWidth = width - H_PADDING * 2;
  const bannerHeight = bannerWidth / BANNER_RATIO;

  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<Offer>>(null);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const i = Math.round(x / bannerWidth);
      setIndex((prev) => (prev === i ? prev : i));
    },
    [bannerWidth],
  );

  const renderItem = useCallback(
    ({ item }: { item: Offer }) => (
      <Pressable
        onPress={() => onPressOffer(item)}
        style={({ pressed }) => [
          styles.slide,
          { width: bannerWidth, height: bannerHeight },
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={item.titleAr || item.title}
      >
        {item.imageUrl ? (
          // Full-bleed artwork exactly as the API delivered it.
          <Image
            source={{ uri: item.imageUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            accessible={false}
          />
        ) : (
          // No artwork → fall back to the offer's own copy on a brand panel.
          <View style={styles.textOnly}>
            <Text style={styles.title} numberOfLines={2}>
              {item.titleAr || item.title}
            </Text>
            {!!item.code && (
              <View style={styles.codePill}>
                <Text style={styles.codeText}>{item.code}</Text>
              </View>
            )}
          </View>
        )}
      </Pressable>
    ),
    [bannerWidth, bannerHeight, onPressOffer],
  );

  const keyExtractor = useCallback((o: Offer) => o.id, []);

  if (!offers.length) return null;

  return (
    <View>
      <FlatList
        ref={listRef}
        data={offers}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        snapToInterval={bannerWidth}
        decelerationRate="fast"
        // RN already mirrors horizontal lists under RTL; forcing an inversion
        // here would double-flip and start the user on the last slide.
        getItemLayout={(_, i) => ({
          length: bannerWidth,
          offset: bannerWidth * i,
          index: i,
        })}
      />

      {offers.length > 1 && (
        <View style={styles.dots}>
          {offers.map((o, i) => (
            <View key={o.id} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

export const OffersCarousel = memo(OffersCarouselBase);

const styles = StyleSheet.create({
  slide: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: colors.brand.redLight,
    ...shadows.sm,
  },
  textOnly: {
    flex: 1,
    backgroundColor: colors.brand.red,
    padding: spacing.lg,
    justifyContent: 'center',
    alignItems: I18nManager.isRTL ? 'flex-end' : 'flex-start',
    gap: spacing.sm,
  },
  title: {
    color: colors.white,
    fontSize: 20,
    fontFamily: fontFamilies.bodyExtraBold,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  codePill: {
    backgroundColor: colors.brand.gold,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  codeText: {
    color: colors.brand.dark,
    fontSize: 14,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  dots: {
    flexDirection: 'row',
    alignSelf: 'center',
    marginTop: spacing.sm,
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E4DAD3',
  },
  dotActive: { width: 18, backgroundColor: colors.brand.red },
  pressed: { opacity: 0.92 },
});
