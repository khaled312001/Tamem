/**
 * A thin bar that appears when the connection drops.
 *
 * Offline reading only helps if the customer knows that is what they are
 * doing. Without this, cached prices and a cached "مفتوح" badge look live: they
 * build a basket against yesterday's menu and only find out at the confirm
 * button. The bar says the screen is from storage, and says when it came back.
 *
 * Mounted once at the app root, above the navigator, so it covers every screen
 * including the ones inside modals.
 */
import { onlineManager } from '@tanstack/react-query';
import { CloudOff, Wifi } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontFamilies, fontSizes, spacing } from '../theme/tokens';

const ROW = 'row' as const;

export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const [online, setOnline] = useState(onlineManager.isOnline());
  // Distinguishes "never been offline" from "just came back", so a normal
  // launch does not flash a green "الاتصال رجع" bar at someone whose
  // connection never went anywhere.
  const [justBack, setJustBack] = useState(false);
  const wasOffline = useRef(false);
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    return onlineManager.subscribe((isOnline) => {
      setOnline(isOnline);
      if (!isOnline) {
        wasOffline.current = true;
        setJustBack(false);
      } else if (wasOffline.current) {
        wasOffline.current = false;
        setJustBack(true);
        // Long enough to read, short enough not to become furniture.
        setTimeout(() => setJustBack(false), 2600);
      }
    });
  }, []);

  const visible = !online || justBack;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 1 : 0,
      duration: 200,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [visible, slide]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        { paddingTop: insets.top + 6, opacity: slide },
        online ? styles.back : styles.off,
      ]}
    >
      <View style={[styles.row, { flexDirection: ROW }]}>
        {online ? (
          <Wifi size={14} color={colors.white} />
        ) : (
          <CloudOff size={14} color={colors.white} />
        )}
        <Text style={styles.text} numberOfLines={1}>
          {online ? 'رجع الاتصال — بنحدّث البيانات' : 'مفيش إنترنت — بتشوف آخر نسخة محفوظة'}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingBottom: 7,
    paddingHorizontal: spacing.lg,
    zIndex: 999,
    elevation: 999,
  },
  off: { backgroundColor: '#5A5A5A' },
  back: { backgroundColor: colors.success },
  row: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  text: {
    color: colors.white,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyBold,
  },
});
