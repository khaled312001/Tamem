import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect } from 'react';

import { OnboardingTour } from '../components/OnboardingTour';
import { navigationRef, registerForPushNotifications, usePushTapNavigation } from '../lib/push';
import { useShareLinks } from '../lib/shareLinks';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { CollectPhoneScreen } from '../screens/CollectPhoneScreen';
import { SplashScreen } from '../screens/SplashScreen';
import { useAuth } from '../stores/auth';

import { AppTabs } from './AppTabs';
import { AuthStack } from './AuthStack';
import { MerchantTabs } from './MerchantTabs';

export type RootStackParamList = {
  Splash: undefined;
  Auth: undefined;
  App: undefined;
  MerchantApp: undefined;
  CollectPhone: undefined;
};

// Backend assigns `g_<googleSub>` as a temporary phone for first-time Google
// sign-ins until the customer provides a real number. We pivot to a dedicated
// onboarding screen whenever we detect that placeholder.
function needsPhoneCollection(phone: string | undefined | null): boolean {
  if (!phone) return true;
  return phone.startsWith('g_');
}

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { user, hydrated, hydrate } = useAuth();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (user) {
      void registerForPushNotifications();
      // Eagerly open the WebSocket so screens get realtime order updates without
      // each one having to open its own connection.
      void connectSocket();
    } else {
      disconnectSocket();
    }
  }, [user]);

  // 1) Auth is still loading from storage — show splash without CTA
  if (!hydrated) return <SplashScreen />;

  // 2) No session: straight to the welcome screen (LoginScreen). It used to
  //    open on a red splash with «ابدأ الآن» first, a tap that led to a page
  //    saying hello again. The welcome screen now introduces Tamem itself.

  // 3) Google first-login → mandatory phone collection before reaching the app
  const mustCollectPhone = !!user && needsPhoneCollection(user.phone);

  return (
    <NavigationContainer ref={navigationRef}>
      <PushNavBridge />
      <ShareLinkBridge
        canOpen={!!user && !mustCollectPhone && user.role !== 'MERCHANT'}
        dropLinks={!!user && user.role === 'MERCHANT'}
      />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Auth" component={AuthStack} />
        ) : mustCollectPhone ? (
          <Stack.Screen name="CollectPhone" component={CollectPhoneScreen} />
        ) : user.role === 'MERCHANT' ? (
          // Merchants get an entirely separate tab graph (dashboard / orders /
          // products / profile). They never see the customer-facing AppTabs.
          <Stack.Screen name="MerchantApp" component={MerchantTabs} />
        ) : (
          <Stack.Screen name="App" component={AppTabs} />
        )}
      </Stack.Navigator>
      {/* Mounted globally so it overlays whatever screen is active. */}
      <OnboardingTour />
    </NavigationContainer>
  );
}

/** Tiny child component so the usePushTapNavigation hook can call useEffect
 *  inside the NavigationContainer tree. */
function PushNavBridge(): null {
  usePushTapNavigation();
  return null;
}

/** Opens deliverytamem.com/s|p|o/<id> links (and tamem://…) on their page. */
function ShareLinkBridge({ canOpen, dropLinks }: { canOpen: boolean; dropLinks: boolean }): null {
  useShareLinks(canOpen, dropLinks);
  return null;
}
