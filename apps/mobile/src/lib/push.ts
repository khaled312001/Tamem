import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { createNavigationContainerRef } from '@react-navigation/native';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { api } from './api';

// Foreground behavior: show banner + play sound + set system badge
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Navigation ref shared with RootNavigator so push handlers can route
 * without going through React props. Set by RootNavigator on mount.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const navigationRef = createNavigationContainerRef<any>();

/**
 * Requests notification permission and registers the Expo push token with the backend.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Tamem default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#E0301E',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const ask = await Notifications.requestPermissionsAsync();
    status = ask.status;
  }
  if (status !== 'granted') return null;

  try {
    // The RAW native token (FCM on Android, APNs on iOS) — NOT the Expo push
    // token — because the backend sends directly via Firebase Cloud Messaging
    // HTTP v1. getExpoPushTokenAsync would return an ExponentPushToken the FCM
    // API rejects.
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    const token = String(tokenResp.data);
    await api.raw.post('/me/devices', { token, platform: Platform.OS });
    return token;
  } catch {
    return null;
  }
}

/** Stop pushes to this device on logout, so a shared phone doesn't leak the
 *  previous user's order notifications. Best-effort. */
export async function unregisterPushToken(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    await api.raw.post('/me/devices/unregister', { token: String(tokenResp.data) });
  } catch {
    /* ignore — token may already be gone */
  }
}

/** Reset the system badge — call after the user opens the Notifications tab. */
export async function clearAppBadge(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch {
    /* ignore */
  }
}

/**
 * Hook that wires both cold-start and warm-start notification taps to React
 * Navigation. Must be mounted inside <NavigationContainer> (RootNavigator).
 *
 * Notification data shape we honor:
 *   { orderId: string }           → Orders → OrderTracking
 *   { screen: 'Coupons' }         → Profile → Coupons
 *   { type: 'promo' }             → Notifications tab
 */
const HANDLED_RESP_KEY = '@tamem/handled-notif-id';

export function usePushTapNavigation(): void {
  useEffect(() => {
    // expo-notifications is native-only; skip on web entirely.
    if (Platform.OS === 'web') return;
    // Cold start — app opened from a notification tap. CRITICAL: only route once
    // per notification. getLastNotificationResponseAsync() persistently returns
    // the LAST response, so without this guard EVERY normal app launch would
    // re-navigate to that old notification's screen — which is exactly why the
    // app kept opening on the Notifications page instead of Home.
    void Notifications.getLastNotificationResponseAsync().then(async (resp) => {
      if (!resp) return;
      const id = resp.notification.request.identifier;
      const alreadyHandled = await AsyncStorage.getItem(HANDLED_RESP_KEY);
      if (id && id === alreadyHandled) return; // stale — a plain launch, stay on Home
      if (id) await AsyncStorage.setItem(HANDLED_RESP_KEY, id);
      handle(resp);
    });
    // Warm tap — app was in background or foreground; these are always genuine.
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const id = resp.notification.request.identifier;
      if (id) void AsyncStorage.setItem(HANDLED_RESP_KEY, id);
      handle(resp);
    });
    return () => sub.remove();
  }, []);
}

function handle(resp: Notifications.NotificationResponse): void {
  const data = (resp.notification.request.content.data ?? {}) as Record<string, unknown>;
  if (!navigationRef.isReady()) {
    // Retry once nav settles — happens during cold start while gestures init.
    setTimeout(() => {
      if (navigationRef.isReady()) routeByData(data);
    }, 300);
    return;
  }
  routeByData(data);
}

function routeByData(data: Record<string, unknown>): void {
  if (typeof data.orderId === 'string' && data.orderId) {
    navigationRef.navigate('App', {
      screen: 'Orders',
      params: { screen: 'OrderTracking', params: { orderId: data.orderId } },
    });
    return;
  }
  if (data.screen === 'Coupons') {
    navigationRef.navigate('App', { screen: 'ProfileTab', params: { screen: 'Coupons' } });
    return;
  }
  // Default: surface the Notifications tab
  navigationRef.navigate('App', { screen: 'Notifications' });
}
