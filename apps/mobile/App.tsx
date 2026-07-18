// Fast-refresh runtime for web (no-op on native)
import '@expo/metro-runtime';

import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect } from 'react';
import { AppState, type AppStateStatus, I18nManager, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastHost } from './src/components/ToastHost';
import { useBrandFonts } from './src/lib/fonts';
import { ensureNotificationChannel } from './src/lib/push';
import { RootNavigator } from './src/navigation/RootNavigator';

// Force RTL on app launch. A reload may be needed on first install.
if (!I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}

// On RN-Web, I18nManager.forceRTL does NOT automatically set the document
// direction. Without `dir="rtl"` on <html>, flexDirection: 'row' renders LTR
// even though I18nManager says it's RTL — every screen looks like a half-flipped
// translation. Set it explicitly so flex, logical properties (start/end), and
// inline text alignment all behave naturally for Arabic users.
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('dir', 'rtl');
  document.documentElement.setAttribute('lang', 'ar');
}

// Keep the splash visible while we load fonts + restore session
SplashScreen.preventAutoHideAsync().catch(() => undefined);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // Shorter freshness so screens live-update without a manual pull: data is
      // considered stale after 15s, so any refetch trigger (screen focus, app
      // foreground, reconnect, or a screen's own interval) actually refetches.
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      // Refetch when the user returns to the app or a screen regains focus, so
      // coming back always shows current data — no pull-to-refresh needed.
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      refetchOnReconnect: 'always',
    },
  },
});

// Wire TanStack Query's focus + online managers to React Native's AppState /
// NetInfo equivalents. Without this, refetchOnWindowFocus never fires on native
// (it only knows about the browser window). Now every screen refreshes the
// moment the app returns to the foreground.
focusManager.setEventListener((handleFocus) => {
  const onChange = (status: AppStateStatus) => handleFocus(status === 'active');
  const sub = AppState.addEventListener('change', onChange);
  return () => sub.remove();
});
// Treat the app as online on native (NetInfo isn't a dependency); reconnect
// refetch is still driven by refetchOnReconnect + the fetch retry.
if (Platform.OS !== 'web') onlineManager.setOnline(true);

export default function App() {
  const fontsLoaded = useBrandFonts();

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded]);

  useEffect(() => {
    if (fontsLoaded) onLayoutRootView();
  }, [fontsLoaded, onLayoutRootView]);

  // The Android channel must exist BEFORE any push arrives — Android 8+ silently
  // drops a notification whose channel is missing. It used to be created only
  // inside registerForPushNotifications(), which runs on login, so a push that
  // landed before the first sign-in had nowhere to go. Creating it here is
  // idempotent and costs nothing.
  useEffect(() => {
    void ensureNotificationChannel();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <View style={{ flex: 1 }}>
            <RootNavigator />
            <ToastHost />
          </View>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
