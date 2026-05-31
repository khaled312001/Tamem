// Fast-refresh runtime for web (no-op on native)
import '@expo/metro-runtime';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect } from 'react';
import { I18nManager, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useBrandFonts } from './src/lib/fonts';
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
      // Generous defaults: data stays fresh for 1m, cached in memory for 5m.
      // Reduces network thrash when a user bounces between tabs.
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: 'always',
    },
  },
});

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

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <View style={{ flex: 1 }}>
            <RootNavigator />
          </View>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
