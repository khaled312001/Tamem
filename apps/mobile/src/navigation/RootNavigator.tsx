import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';

import { registerForPushNotifications } from '../lib/push';
import { SplashScreen } from '../screens/SplashScreen';
import { useAuth } from '../stores/auth';

import { AppTabs } from './AppTabs';
import { AuthStack } from './AuthStack';

export type RootStackParamList = {
  Splash: undefined;
  Auth: undefined;
  App: undefined;
};

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
    }
  }, [user]);

  // 1) Auth is still loading from storage — show splash without CTA
  if (!hydrated) return <SplashScreen />;

  // 2) First-time visitor (no session) — show intro splash with "ابدأ الآن" CTA
  //    until they tap it. Then we fall through to AuthStack.
  if (!user && !introDismissed) {
    return <SplashScreen onStart={() => setIntroDismissed(true)} />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="App" component={AppTabs} />
        ) : (
          <Stack.Screen name="Auth" component={AuthStack} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
