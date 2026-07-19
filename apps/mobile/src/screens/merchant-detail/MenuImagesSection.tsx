/**
 * "منيو المتجر" — the store's photographed paper menu.
 *
 * For a lot of merchants here this IS the catalogue: there are no structured
 * products, just photos, and the customer orders by free text. So the menu has
 * to be genuinely readable — previously these rendered as full-width
 * `resizeMode="contain"` images stacked in the page, which meant a phone-sized
 * strip of unreadable text and no way to enlarge it.
 *
 * Now: a horizontal rail of covers, and tapping one opens a fullscreen viewer
 * that pages through every image.
 */
import { Maximize2 } from 'lucide-react-native';
import { memo, useCallback, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { ImageViewer } from '../../components/ImageViewer';
import { colors, fontFamilies, radii, shadows, spacing } from '../../theme/tokens';

const ROW = 'row' as const;
const CARD_W = 170;
const CARD_H = 210;

interface Props {
  images: string[];
}

function MenuImagesSectionBase({ images }: Props) {
  const [viewerAt, setViewerAt] = useState<number | null>(null);

  const renderItem = useCallback(
    ({ item, index }: { item: string; index: number }) => (
      <Pressable
        onPress={() => setViewerAt(index)}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`صورة المنيو ${index + 1}`}
      >
        <Image source={{ uri: item }} style={styles.cardImg} resizeMode="cover" />

        <View style={styles.expandBadge}>
          <Maximize2 size={14} color={colors.brand.dark} />
        </View>

        <View style={styles.cardCaption}>
          <Text style={styles.cardCaptionText}>اضغط لعرض المنيو</Text>
        </View>
      </Pressable>
    ),
    [],
  );

  if (!images.length) return null;

  return (
    <View>
      <View style={[styles.header, { flexDirection: ROW }]}>
        <Text style={styles.title}>منيو المتجر</Text>
        <Text style={styles.count}>{images.length} صورة</Text>
      </View>

      <FlatList
        data={images}
        keyExtractor={(uri, i) => `${uri}-${i}`}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      />

      <ImageViewer images={images} startIndex={viewerAt} onClose={() => setViewerAt(null)} />
    </View>
  );
}

export const MenuImagesSection = memo(MenuImagesSectionBase);

const styles = StyleSheet.create({
  header: { alignItems: 'baseline', justifyContent: 'space-between', marginBottom: spacing.sm },
  title: {
    fontSize: 18,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyExtraBold,
    textAlign: 'auto',
  },
  count: { fontSize: 12, color: colors.brand.gray, fontFamily: fontFamilies.body },

  rail: { gap: spacing.md, paddingVertical: 2 },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: '#F6F0EC',
    ...shadows.sm,
  },
  cardImg: { width: '100%', height: '100%' },
  expandBadge: {
    position: 'absolute',
    top: spacing.sm,
    insetInlineEnd: spacing.sm,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardCaption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(36,19,16,0.72)',
    paddingVertical: 7,
    alignItems: 'center',
  },
  cardCaptionText: {
    color: colors.white,
    fontSize: 12,
    fontFamily: fontFamilies.bodyBold,
  },

  pressed: { opacity: 0.85 },
});
