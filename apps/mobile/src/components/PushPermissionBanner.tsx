import * as Notifications from 'expo-notifications';
import { BellOff } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { registerForPushNotifications } from '../lib/push';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

/**
 * Shown when the phone blocks our notifications.
 *
 * The app asks once at sign-in. Someone who taps «لا» there never saw an
 * order update on the lock screen again, and nothing in the app said why or
 * how to undo it. This card says it and fixes it: it asks again while Android
 * still lets us, otherwise it opens the app's settings page. It checks again
 * every time the app comes back to the front, so it goes away by itself once
 * notifications are on, and registers the device right then.
 */
export function PushPermissionBanner() {
  const [state, setState] = useState<'unknown' | 'granted' | 'ask' | 'settings'>('unknown');

  const check = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      const p = await Notifications.getPermissionsAsync();
      if (p.status === 'granted') {
        setState((prev) => {
          // Just switched on from the settings page: send the token now.
          if (prev === 'ask' || prev === 'settings') void registerForPushNotifications();
          return 'granted';
        });
      } else {
        setState(p.canAskAgain ? 'ask' : 'settings');
      }
    } catch {
      setState('granted'); // can't tell, so don't nag
    }
  }, []);

  useEffect(() => {
    void check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void check();
    });
    return () => sub.remove();
  }, [check]);

  if (state === 'unknown' || state === 'granted') return null;

  const turnOn = async () => {
    if (state === 'ask') {
      const token = await registerForPushNotifications();
      if (token) {
        setState('granted');
        return;
      }
      await check();
      return;
    }
    void Linking.openSettings();
  };

  return (
    <View style={styles.card}>
      <View style={styles.icon}>
        <BellOff size={20} color={colors.brand.red} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>الإشعارات مقفولة على موبايلك</Text>
        <Text style={styles.body}>فعّلها عشان يوصلك تحديث طلبك والعروض حتى لو التطبيق مقفول.</Text>
        <Pressable
          onPress={turnOn}
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Text style={styles.btnText}>
            {state === 'ask' ? 'فعّل الإشعارات' : 'افتح الإعدادات وفعّلها'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.brand.red,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
    color: colors.ink,
    textAlign: 'right',
  },
  body: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    marginTop: 2,
    textAlign: 'right',
    lineHeight: 20,
  },
  btn: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.brand.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontFamily: fontFamilies.bodyExtraBold, fontSize: fontSizes.xs, color: colors.white },
});
