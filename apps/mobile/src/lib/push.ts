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
    const tokenResp = await Notifications.getExpoPushTokenAsync();
    const fcmToken = tokenResp.data;
    await api.raw.post('/me/fcm-token', { fcmToken });
    return fcmToken;
  } catch {
    return null;
  }
}

/** Reset the system badge — call after the user opens the Notifications tab. */
export async function clearAppBadge(): Promise<void> {
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
export function usePushTapNavigation(): void {
  useEffect(() => {
    // Cold start — app was killed and opened from a notification
    void Notifications.getLastNotificationResponseAsync().then((resp) => {
      if (resp) handle(resp);
    });
    // Warm tap — app was in background or foreground
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
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
