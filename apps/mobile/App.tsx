// Fast-refresh runtime for web (no-op on native)
import '@expo/metro-runtime';

import { QueryClient, focusManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect } from 'react';
import { AppState, type AppStateStatus, I18nManager, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OfflineBanner } from './src/components/OfflineBanner';
import { ToastHost } from './src/components/ToastHost';
import { useBrandFonts } from './src/lib/fonts';
import {
  asyncStoragePersister,
  OFFLINE_MAX_AGE,
  shouldPersistQuery,
  startNetworkWatcher,
} from './src/lib/offline';
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
      // Never retry a 4xx: the server already gave its verdict, and retrying
      // doubled every 401/404/422 app-wide. Only transient failures (network
      // drop, 5xx) are worth a second attempt.
      retry: (failureCount, error) => {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 1;
      },
      // Shorter freshness so screens live-update without a manual pull: data is
      // considered stale after 15s, so any refetch trigger (screen focus, app
      // foreground, reconnect, or a screen's own interval) actually refetches.
      staleTime: 15_000,
      // Must be at least the persisted maxAge. gcTime is what decides whether a
      // query is still in the cache to BE written to disk — leave it at five
      // minutes and everything the customer isn't currently looking at is
      // dropped before it is ever persisted, which makes the whole offline
      // story quietly do nothing.
      gcTime: OFFLINE_MAX_AGE,
      // Serve what we have, then try the network. Without this a query with no
      // connection rejects instead of resolving from the restored cache, and
      // the screen shows its error state on top of data it already holds.
      networkMode: 'offlineFirst',
      // Refetch when the user returns to the app or a screen regains focus, so
      // coming back always shows current data — no pull-to-refresh needed.
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      refetchOnReconnect: 'always',
    },
    mutations: {
      // 'always', NOT the 'online' default-for-offline behaviour: with 'online'
      // TanStack PAUSES a mutation that has no connection and replays it when
      // the radio returns. That is a silent order queue — a basket confirmed
      // half an hour late against prices, stock and opening hours that have all
      // moved on. 'always' makes it attempt and fail immediately, and the
      // screens refuse up front via blockedOffline() with a message that says
      // what to do.
      networkMode: 'always',
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
// Follow the real radio. This used to be a hardcoded `setOnline(true)` with the
// note "NetInfo isn't a dependency" — so the app believed it was connected in a
// basement, sent every query to a network that wasn't there, and showed errors
// instead of the cache it was holding.
startNetworkWatcher();

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
        {/* Restores the cache from AsyncStorage before the tree renders, so a
            cold start with no connection opens on real content instead of
            empty lists. */}
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister: asyncStoragePersister,
            maxAge: OFFLINE_MAX_AGE,
            // Bump when a response shape changes — a restored cache in the old
            // shape would render against new code that expects the new one.
            buster: 'v1',
            dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
          }}
        >
          <StatusBar style="light" />
          <View style={{ flex: 1 }}>
            <RootNavigator />
            <OfflineBanner />
            <ToastHost />
          </View>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
