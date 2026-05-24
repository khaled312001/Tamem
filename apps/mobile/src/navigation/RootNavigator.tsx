import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';

import { registerForPushNotifications } from '../lib/push';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { CollectPhoneScreen } from '../screens/CollectPhoneScreen';
import { SplashScreen } from '../screens/SplashScreen';
import { useAuth } from '../stores/auth';

import { AppTabs } from './AppTabs';
import { AuthStack } from './AuthStack';

export type RootStackParamList = {
  Splash: undefined;
  Auth: undefined;
  App: undefined;
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
  const [introDismissed, setIntroDismissed] = useState(false);

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

  // 2) First-time visitor (no session) — show intro splash with "ابدأ الآن" CTA
  //    until they tap it. Then we fall through to AuthStack.
  if (!user && !introDismissed) {
    return <SplashScreen onStart={() => setIntroDismissed(true)} />;
  }

  // 3) Google first-login → mandatory phone collection before reaching the app
  const mustCollectPhone = !!user && needsPhoneCollection(user.phone);

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Auth" component={AuthStack} />
        ) : mustCollectPhone ? (
          <Stack.Screen name="CollectPhone" component={CollectPhoneScreen} />
        ) : (
          <Stack.Screen name="App" component={AppTabs} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
