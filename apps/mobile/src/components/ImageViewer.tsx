/**
 * Fullscreen image viewer, shared by the store menu and product galleries.
 *
 * Navigation is SWIPE-first — a horizontal pager the customer flicks through —
 * with big left/right arrows and a counter as backup. Each page pinch-zooms and
 * double-taps to zoom (works on Android, unlike the old ScrollView zoom); while
 * a page is zoomed the pager is locked so the zoom gesture doesn't fight it.
 */
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { memo, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fontFamilies, radii, spacing } from '../theme/tokens';

const ROW = 'row' as const;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

interface Props {
  images: string[];
  /** Index to open at; null keeps the viewer closed. */
  startIndex: number | null;
  onClose: () => void;
}

/** One pager page: pinch + double-tap zoom (no pan, so it never fights the
 *  horizontal swipe). Reports zoom state so the parent can lock the pager. */
function ZoomablePage({
  uri,
  width,
  height,
  onZoomChange,
}: {
  uri: string;
  width: number;
  height: number;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const scale = useSharedValue(1);
  const saved = useSharedValue(1);
  const report = (z: boolean) => onZoomChange(z);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(saved.value * e.scale, 0.9), MAX_SCALE);
    })
    .onEnd(() => {
      if (scale.value <= 1) {
        scale.value = withTiming(1);
        saved.value = 1;
        runOnJS(report)(false);
      } else {
        saved.value = scale.value;
        runOnJS(report)(true);
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(260)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withTiming(1);
        saved.value = 1;
        runOnJS(report)(false);
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE);
        saved.value = DOUBLE_TAP_SCALE;
        runOnJS(report)(true);
      }
    });

  const gesture = Gesture.Simultaneous(pinch, doubleTap);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.page, { width, height }]}>
        <Animated.Image
          source={{ uri }}
          style={[{ width, height: height * 0.85 }, animStyle]}
          resizeMode="contain"
        />
      </Animated.View>
    </GestureDetector>
  );
}

function ImageViewerBase({ images, startIndex, onClose }: Props) {
  const { width, height } = Dimensions.get('window');
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listRef = useRef<FlatList<any>>(null);

  useEffect(() => {
    if (startIndex !== null) {
      setIndex(startIndex);
      setZoomed(false);
    }
  }, [startIndex]);

  const goTo = (i: number) => {
    const n = Math.min(Math.max(i, 0), images.length - 1);
    if (n === index) return;
    setZoomed(false);
    setIndex(n);
    try {
      listRef.current?.scrollToIndex({ index: n, animated: true });
    } catch {
      /* index momentarily out of range during layout — ignore */
    }
  };

  const atStart = index <= 0;
  const atEnd = index >= images.length - 1;

  return (
    <Modal
      visible={startIndex !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" />
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.backdrop}>
          <FlatList
            ref={listRef}
            data={images}
            keyExtractor={(uri, i) => `${uri}-${i}`}
            horizontal
            pagingEnabled
            // Locked while a page is zoomed, so the zoom gesture owns the touch.
            scrollEnabled={!zoomed}
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={startIndex ?? 0}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => (
              <ZoomablePage uri={item} width={width} height={height} onZoomChange={setZoomed} />
            )}
          />

          <SafeAreaView edges={['top']} style={styles.bar} pointerEvents="box-none">
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={styles.iconBtn}
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

          {/* Both arrows, physically placed (not RTL-logical) so neither hides.
              In Arabic reading order the right arrow steps back, the left steps
              forward. Hidden while zoomed so they don't sit over the image. */}
          {images.length > 1 && !zoomed && (
            <>
              <Pressable
                onPress={() => goTo(index - 1)}
                style={[styles.nav, styles.navRight, atStart && styles.navOff]}
                disabled={atStart}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="السابق"
              >
                <ChevronRight size={28} color={colors.white} />
              </Pressable>
              <Pressable
                onPress={() => goTo(index + 1)}
                style={[styles.nav, styles.navLeft, atEnd && styles.navOff]}
                disabled={atEnd}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="التالي"
              >
                <ChevronLeft size={28} color={colors.white} />
              </Pressable>
            </>
          )}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

export const ImageViewer = memo(ImageViewerBase);

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' },
  page: { alignItems: 'center', justifyContent: 'center' },
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
  iconBtn: {
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
  nav: {
    position: 'absolute',
    top: '50%',
    marginTop: -26,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navRight: { right: spacing.md },
  navLeft: { left: spacing.md },
  navOff: { opacity: 0 },
});
