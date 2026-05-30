/**
 * Lightweight entry animation for list cards — fades in + slides up by 8px on
 * mount, with a tiny per-index stagger so a freshly-loaded list looks alive.
 * Uses the built-in Animated API (native-driver), no Reanimated worklets.
 */
import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

interface AnimatedListItemProps {
  index?: number;
  children: React.ReactNode;
}

export function AnimatedListItem({ index = 0, children }: AnimatedListItemProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    const delay = Math.min(index, 6) * 35;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 240,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 280,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, opacity, translateY]);

  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
}
