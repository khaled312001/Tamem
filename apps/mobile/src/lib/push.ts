import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from './api';

// Foreground behavior: show banner + play sound
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Requests notification permission and registers the Expo push token with the backend.
 * Returns the token (or null if denied / not on a physical device).
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
