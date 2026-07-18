import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { createNavigationContainerRef } from '@react-navigation/native';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { api } from './api';

// Foreground behavior: show a heads-up banner + play sound + bump the badge —
// so a notification pops over the app like WhatsApp/Telegram even while it's
// open (Android only shows heads-up when the channel importance is HIGH/MAX,
// which the 'default' channel below is).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, // legacy key (SDK ≤52) — keep for back-compat
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true, // new key (SDK 53+)
    shouldShowList: true,
  }),
});

/**
 * Creates the high-priority notification channel. MUST exist before any push
 * lands, otherwise Android 8+ silently drops it — so this runs at app bootstrap,
 * BEFORE login/permission, not only at token registration. MAX importance makes
 * it a heads-up notification with sound + vibration, matching WhatsApp.
 */
export async function ensureNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'إشعارات تميم',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#E0301E',
      sound: 'default',
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
    });
  } catch {
    /* channel setup is best-effort */
  }
}

/**
 * Navigation ref shared with RootNavigator so push handlers can route
 * without going through React props. Set by RootNavigator on mount.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const navigationRef = createNavigationContainerRef<any>();

/**
 * Requests notification permission and registers the Expo push token with the backend.
 */
let tokenRefreshSub: Notifications.Subscription | null = null;

async function sendTokenToBackend(token: string): Promise<void> {
  try {
    await api.raw.post('/me/devices', { token, platform: Platform.OS });
  } catch {
    /* will retry on next app open / token change */
  }
}

export async function registerForPushNotifications(): Promise<string | null> {
  await ensureNotificationChannel();

  // POST_NOTIFICATIONS on Android 13+ is requested here.
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const ask = await Notifications.requestPermissionsAsync();
    status = ask.status;
  }
  if (status !== 'granted') return null;

  // Auto-update the stored token whenever FCM rotates it (reinstall, restore,
  // periodic refresh) — otherwise pushes would silently start going to a dead
  // token. Registered once.
  if (!tokenRefreshSub) {
    tokenRefreshSub = Notifications.addPushTokenListener((t) => {
      if (t?.data) void sendTokenToBackend(String(t.data));
    });
  }

  try {
    // The RAW native token (FCM on Android, APNs on iOS) — NOT the Expo push
    // token — because the backend sends directly via Firebase Cloud Messaging
    // HTTP v1. getExpoPushTokenAsync would return an ExponentPushToken the FCM
    // API rejects.
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    const token = String(tokenResp.data);
    await sendTokenToBackend(token);
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
