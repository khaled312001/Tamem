/**
 * Fullscreen image pager, shared by the store menu and product galleries.
 *
 * Pinch-zoom rides on ScrollView's built-in zoom, which is iOS-only — the app
 * has no react-native-gesture-handler dependency and adding one is a native
 * change that needs a rebuild. On Android the image still fills the screen,
 * which is the part that actually mattered: menus and product shots were
 * previously stuck at thumbnail size with no way to enlarge them.
 */
import { X } from 'lucide-react-native';
import { memo, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fontFamilies, radii, spacing } from '../theme/tokens';

const ROW = 'row' as const;

interface Props {
  images: string[];
  /** Index to open at; null keeps the viewer closed. */
  startIndex: number | null;
  onClose: () => void;
}

function ImageViewerBase({ images, startIndex, onClose }: Props) {
  const { width, height } = Dimensions.get('window');
  const [index, setIndex] = useState(0);

  return (
    <Modal
      visible={startIndex !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      // The pager remounts on each open, so re-sync the counter with it.
      onShow={() => setIndex(startIndex ?? 0)}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" />
      <View style={styles.backdrop}>
        <FlatList
          data={images}
          keyExtractor={(uri, i) => `${uri}-${i}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={startIndex ?? 0}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => (
            <ScrollView
              style={{ width, height }}
              contentContainerStyle={styles.zoomContent}
              maximumZoomScale={4}
              minimumZoomScale={1}
              centerContent
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
            >
              <Image
                source={{ uri: item }}
                style={{ width, height: height * 0.85 }}
                resizeMode="contain"
              />
            </ScrollView>
          )}
        />

        <SafeAreaView edges={['top']} style={styles.bar} pointerEvents="box-none">
          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="إغلاق"
          >
            <X size={22} color={colors.white} />
          </Pressable>

          {images.length > 1 && (
            <View style={styles.counter}>
              <Text style={styles.counterText}>
                {index + 1} / {images.length}
              </Text>
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export const ImageViewer = memo(ImageViewerBase);

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' },
  zoomContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: ROW,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  counterText: { color: colors.white, fontSize: 13, fontFamily: fontFamilies.bodyBold },
});
