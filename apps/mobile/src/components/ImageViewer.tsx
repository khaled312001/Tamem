/**
 * Fullscreen image viewer, shared by the store menu and product galleries.
 *
 * Real pinch-to-zoom + double-tap + pan, built on gesture-handler + reanimated
 * so it works on Android too (the old version rode on ScrollView's built-in
 * zoom, which is iOS-only — Android users could enlarge nothing). One image at a
 * time with arrows/counter for navigation, so the pan gesture never fights a
 * horizontal pager.
 */
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { memo, useEffect, useState } from 'react';
import { Dimensions, Modal, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
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

function ZoomableImage({
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
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const report = (z: boolean) => onZoomChange(z);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(savedScale.value * e.scale, 0.85), MAX_SCALE);
    })
    .onEnd(() => {
      if (scale.value <= 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedTx.value = 0;
        savedTy.value = 0;
        runOnJS(report)(false);
      } else {
        savedScale.value = scale.value;
        runOnJS(report)(true);
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      // Only meaningful once zoomed in; at 1x the image stays put.
      if (scale.value <= 1) return;
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(260)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedTx.value = 0;
        savedTy.value = 0;
        runOnJS(report)(false);
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE);
        savedScale.value = DOUBLE_TAP_SCALE;
        runOnJS(report)(true);
      }
    });

  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

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

  useEffect(() => {
    if (startIndex !== null) {
      setIndex(startIndex);
      setZoomed(false);
    }
  }, [startIndex]);

  const go = (delta: number) => {
    setZoomed(false);
    setIndex((i) => Math.min(Math.max(i + delta, 0), images.length - 1));
  };

  const uri = images[index];

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
          {/* Remount on index change so each image opens back at 1×. */}
          {uri != null && (
            <ZoomableImage
              key={index}
              uri={uri}
              width={width}
              height={height}
              onZoomChange={setZoomed}
            />
          )}

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

          {/* Arrows hide while zoomed so they don't sit over a panned image. */}
          {images.length > 1 && !zoomed && (
            <>
              {index > 0 && (
                <Pressable
                  onPress={() => go(-1)}
                  style={[styles.nav, styles.navStart]}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="السابق"
                >
                  <ChevronRight size={26} color={colors.white} />
                </Pressable>
              )}
              {index < images.length - 1 && (
                <Pressable
                  onPress={() => go(1)}
                  style={[styles.nav, styles.navEnd]}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="التالي"
                >
                  <ChevronLeft size={26} color={colors.white} />
                </Pressable>
              )}
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
    marginTop: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navStart: { insetInlineStart: spacing.lg },
  navEnd: { insetInlineEnd: spacing.lg },
});
