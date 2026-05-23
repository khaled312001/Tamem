import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';

import { HomeScreen } from '../screens/HomeScreen';
import { OrdersScreen } from '../screens/OrdersScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';

import { colors } from '../theme/tokens';

export type AppTabsParamList = {
  Home: undefined;
  Orders: undefined;
  Notifications: undefined;
  Profile: undefined;
};

const Tabs = createBottomTabNavigator<AppTabsParamList>();

export function AppTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand.red,
        tabBarInactiveTintColor: colors.text.muted,
        tabBarStyle: { borderTopColor: colors.border, height: 60, paddingBottom: 8 },
      }}
    >
      <Tabs.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'الرئيسية', tabBarIcon: () => <Text>🏠</Text> }}
      />
      <Tabs.Screen
        name="Orders"
        component={OrdersScreen}
        options={{ title: 'طلباتي', tabBarIcon: () => <Text>📦</Text> }}
      />
      <Tabs.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ title: 'الإشعارات', tabBarIcon: () => <Text>🔔</Text> }}
      />
      <Tabs.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'حسابي', tabBarIcon: () => <Text>👤</Text> }}
      />
    </Tabs.Navigator>
  );
}
