import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Bell, Home, Package, User } from 'lucide-react-native';

import { NotificationsScreen } from '../screens/NotificationsScreen';
import { OrdersScreen } from '../screens/OrdersScreen';
import { ProfileStack } from './ProfileStack';

import { HomeStack } from './HomeStack';

import { colors, fontFamilies, fontSizes } from '../theme/tokens';

export type AppTabsParamList = {
  HomeTab: undefined;
  Orders: undefined;
  Notifications: undefined;
  ProfileTab: undefined;
};

const Tabs = createBottomTabNavigator<AppTabsParamList>();

export function AppTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand.red,
        tabBarInactiveTintColor: colors.text.muted,
        tabBarStyle: {
          borderTopColor: colors.line,
          backgroundColor: colors.white,
          height: 64,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontFamily: fontFamilies.bodyBold,
          fontSize: fontSizes.xs,
        },
      }}
    >
      <Tabs.Screen
        name="HomeTab"
        component={HomeStack}
        options={{
          title: 'الرئيسية',
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="Orders"
        component={OrdersScreen}
        options={{
          title: 'طلباتي',
          tabBarIcon: ({ color, size }) => <Package size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: 'الإشعارات',
          tabBarIcon: ({ color, size }) => <Bell size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="ProfileTab"
        component={ProfileStack}
        options={{
          title: 'حسابي',
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
        }}
      />
    </Tabs.Navigator>
  );
}
