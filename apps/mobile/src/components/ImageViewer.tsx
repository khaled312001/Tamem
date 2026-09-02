/**
 * Fullscreen image viewer, shared by the store menu and the product gallery.
 *
 * For a lot of merchants here the photographed paper menu IS the catalogue, so
 * "can I read the small print on page 3" is not a nicety — it is whether the
 * customer can order at all. That means three things, and the previous version
 * had none of them:
 *
 *   1. ZOOM THAT STICKS, ON EVERY PAGE. Zoom state was reported to the parent
 *      with setState, and the parent's `renderItem` was an inline arrow — so a
 *      new element type every render. Finishing a pinch re-rendered the list,
 *      remounted every page, and `useSharedValue(1)` started over: the image
 *      snapped straight back to 1×. `renderItem` is a stable useCallback now
 *      and each page is memoised, so a page survives its own zoom.
 *
 *   2. PANNING. The old page had no pan gesture at all — the comment said so,
 *      to keep it from fighting the horizontal pager. Zooming into the middle
 *      of a menu and being unable to reach the edges is not zoom. The pager is
 *      locked while a page is zoomed, which frees the whole surface for a pan
 *      that is clamped to the image's real edges.
 *
 *   3. RESOLUTION. Android decodes an Image down to its layout box, so scaling
 *      the view afterwards magnifies an already-thrown-away bitmap: blurry
 *      exactly when you need detail. `resizeMethod="none"` keeps the full
 *      decode, and the page lays the image out at its true fitted size rather
 *      than a 0.85-height guess.
 */
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fontFamilies, radii, spacing } from '../theme/tokens';

const ROW = 'row' as const;
/** Deliberately generous — a phone photo of an A4 menu needs real magnification
 *  before the prices are legible. */
const MAX_SCALE = 8;
const DOUBLE_TAP_SCALE = 3;

interface Props {
  images: string[];
  /** Index to open at; null keeps the viewer closed. */
  startIndex: number | null;
  onClose: () => void;
}

interface PageProps {
  uri: string;
  width: number;
  height: number;
  /** Bumped by the parent when the pager moves, so pages drop their zoom. */
  resetTick: number;
  onZoomChange: (zoomed: boolean) => void;
}

/**
 * One pager page: pinch (about the fingers), pan (clamped to the image), and
 * double-tap (toward the tapped point).
 */
function ZoomablePageBase({ uri, width, height, resetTick, onZoomChange }: PageProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  // The image's real on-screen box. Until it loads we assume it fills the
  // screen; once we know the aspect ratio the pan limits become exact, so the
  // image can be dragged to its true edge and no further.
  const [fit, setFit] = useState({ w: width, h: height });
  const fitW = useSharedValue(width);
  const fitH = useSharedValue(height);

  // `enabled` on a gesture is read from JS, so the pan has to know about zoom
  // in React state as well as on the UI thread. Local state — a parent
  // re-render would be fine now, but there is no reason to cause one per pinch.
  const [isZoomed, setIsZoomed] = useState(false);

  const report = useCallback(
    (z: boolean) => {
      setIsZoomed(z);
      onZoomChange(z);
    },
    [onZoomChange],
  );

  /** How far the image may travel at the current scale, per axis. */
  const limits = useCallback(() => {
    'worklet';
    return {
      x: Math.max(0, (fitW.value * scale.value - width) / 2),
      y: Math.max(0, (fitH.value * scale.value - height) / 2),
    };
  }, [fitH, fitW, height, scale, width]);

  const clamp = useCallback(() => {
    'worklet';
    const l = limits();
    tx.value = Math.min(Math.max(tx.value, -l.x), l.x);
    ty.value = Math.min(Math.max(ty.value, -l.y), l.y);
  }, [limits, tx, ty]);

  const reset = useCallback(() => {
    'worklet';
    scale.value = withTiming(1);
    savedScale.value = 1;
    tx.value = withTiming(0);
    ty.value = withTiming(0);
    savedTx.value = 0;
    savedTy.value = 0;
    runOnJS(report)(false);
  }, [report, savedScale, savedTx, savedTy, scale, tx, ty]);

  // Swiping to another page drops the zoom, so every page is entered at 1×
  // instead of wherever it was left.
  useAnimatedReaction(
    () => resetTick,
    (now, before) => {
      if (before !== null && now !== before && scale.value !== 1) reset();
    },
    [resetTick],
  );

  const pinch = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
    })
    .onUpdate((e) => {
      const next = Math.min(Math.max(savedScale.value * e.scale, 0.85), MAX_SCALE);
      // Keep the point between the fingers under the fingers: shift by how much
      // that point moves as the image grows around its centre.
      const ratio = next / scale.value;
      tx.value = tx.value + (e.focalX - width / 2 - tx.value) * (1 - ratio);
      ty.value = ty.value + (e.focalY - height / 2 - ty.value) * (1 - ratio);
      scale.value = next;
      clamp();
    })
    .onEnd(() => {
      if (scale.value <= 1) {
        reset();
      } else {
        savedScale.value = scale.value;
        clamp();
        savedTx.value = tx.value;
        savedTy.value = ty.value;
        runOnJS(report)(true);
      }
    });

  const pan = Gesture.Pan()
    // Only while zoomed. Unzoomed, the horizontal pager owns the surface —
    // this is what stops a drag from eating the swipe between images.
    .enabled(isZoomed)
    .averageTouches(true)
    .onStart(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    })
    .onUpdate((e) => {
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
      clamp();
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(260)
    .onEnd((e) => {
      if (scale.value > 1) {
        reset();
        return;
      }
      // Zoom toward the tapped point rather than the middle, so double-tapping
      // a dish enlarges that dish.
      scale.value = withTiming(DOUBLE_TAP_SCALE);
      savedScale.value = DOUBLE_TAP_SCALE;
      const l = {
        x: Math.max(0, (fitW.value * DOUBLE_TAP_SCALE - width) / 2),
        y: Math.max(0, (fitH.value * DOUBLE_TAP_SCALE - height) / 2),
      };
      const wantX = (width / 2 - e.x) * (DOUBLE_TAP_SCALE - 1);
      const wantY = (height / 2 - e.y) * (DOUBLE_TAP_SCALE - 1);
      tx.value = withTiming(Math.min(Math.max(wantX, -l.x), l.x));
      ty.value = withTiming(Math.min(Math.max(wantY, -l.y), l.y));
      savedTx.value = wantX;
      savedTy.value = wantY;
      runOnJS(report)(true);
    });

  // Pinch and pan run together (you pinch and drag in one motion); the
  // double-tap wins outright so it is never read as the start of a pan.
  const gesture = Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan));

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.page, { width, height }]}>
        <Animated.Image
          source={{ uri }}
          style={[{ width: fit.w, height: fit.h }, animStyle]}
          resizeMode="contain"
          // Android only. Without it the bitmap is decoded down to the layout
          // box and zooming magnifies the loss — the whole point here is that
          // it stays sharp at 8×.
          resizeMethod={Platform.OS === 'android' ? 'none' : undefined}
          onLoad={(e) => {
            const s = e.nativeEvent?.source;
            if (!s?.width || !s?.height) return;
            // Fit the real aspect ratio into the screen: the pan limits are
            // computed from this box, so guessing it wrongly means the image
            // either cannot reach its edge or drifts past it into blank space.
            const r = Math.min(width / s.width, height / s.height);
            const w = s.width * r;
            const h = s.height * r;
            fitW.value = w;
            fitH.value = h;
            setFit({ w, h });
          }}
        />
      </Animated.View>
    </GestureDetector>
  );
}

const ZoomablePage = memo(ZoomablePageBase);

function ImageViewerBase({ images, startIndex, onClose }: Props) {
  const { width, height } = Dimensions.get('window');
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [resetTick, setResetTick] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listRef = useRef<FlatList<any>>(null);

  useEffect(() => {
    if (startIndex !== null) {
      setIndex(startIndex);
      setZoomed(false);
      setResetTick((t) => t + 1);
    }
  }, [startIndex]);

  // Stable identity — this is what stops the list remounting (and un-zooming)
  // every page whenever the parent re-renders.
  const onZoomChange = useCallback((z: boolean) => setZoomed(z), []);

  const renderItem = useCallback(
    ({ item }: { item: string }) => (
      <ZoomablePage
        uri={item}
        width={width}
        height={height}
        resetTick={resetTick}
        onZoomChange={onZoomChange}
      />
    ),
    [width, height, resetTick, onZoomChange],
  );

  const goTo = (i: number) => {
    const n = Math.min(Math.max(i, 0), images.length - 1);
    if (n === index) return;
    setZoomed(false);
    setResetTick((t) => t + 1);
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
            // Locked while a page is zoomed, so the pan owns the whole surface
            // and a drag moves the image instead of flicking to the next one.
            scrollEnabled={!zoomed}
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={startIndex ?? 0}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onMomentumScrollEnd={(e) => {
              const n = Math.round(e.nativeEvent.contentOffset.x / width);
              if (n !== index) {
                setIndex(n);
                setResetTick((t) => t + 1);
              }
            }}
            renderItem={renderItem}
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

          {/* One-line hint, only while nothing is zoomed yet. */}
          {!zoomed && (
            <SafeAreaView edges={['bottom']} style={styles.hintWrap} pointerEvents="none">
              <Text style={styles.hint}>قرّب بإصبعين أو دوس مرتين — واسحب الصورة للتحريك</Text>
            </SafeAreaView>
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
  page: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
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
  hintWrap: { position: 'absolute', left: 0, right: 0, bottom: spacing.lg, alignItems: 'center' },
  hint: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontFamily: fontFamilies.body,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
});
