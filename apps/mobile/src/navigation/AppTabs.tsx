import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Bell, Home, Package, User } from 'lucide-react-native';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NotificationsScreen } from '../screens/NotificationsScreen';

import { HomeStack } from './HomeStack';
import { OrdersStack } from './OrdersStack';
import { ProfileStack } from './ProfileStack';

import { colors, fontFamilies } from '../theme/tokens';

export type AppTabsParamList = {
  HomeTab: undefined;
  Orders: undefined;
  Notifications: undefined;
  ProfileTab: undefined;
};

const Tabs = createBottomTabNavigator<AppTabsParamList>();

const TAB_ICON_SIZE = 22;

export function AppTabs() {
  // Account for the iOS home-bar / Android nav-bar so icons + labels both fit.
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'web' ? 8 : Math.max(insets.bottom, 8);

  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand.red,
        tabBarInactiveTintColor: colors.text.muted,
        tabBarHideOnKeyboard: true,
        // Force label under the icon on web too (default is `beside-icon` for wide
        // screens, which hides Arabic labels with our 4-tab layout).
        tabBarLabelPosition: 'below-icon',
        tabBarShowLabel: true,
        tabBarStyle: {
          borderTopColor: colors.line,
          backgroundColor: colors.white,
          // Total height = icon (22) + label (~14) + breathing room + bottom inset.
          height: 68 + bottomInset,
          paddingTop: 6,
          paddingBottom: bottomInset,
        },
        tabBarItemStyle: {
          paddingVertical: 0,
        },
        tabBarIconStyle: { marginTop: 4, marginBottom: 0 },
        tabBarLabelStyle: {
          fontFamily: fontFamilies.bodyBold,
          fontSize: 11,
          lineHeight: 14,
          marginTop: 2,
          marginBottom: 2,
          includeFontPadding: false,
        },
      }}
    >
      <Tabs.Screen
        name="HomeTab"
        component={HomeStack}
        options={{
          title: 'الرئيسية',
          tabBarIcon: ({ color }) => <Home size={TAB_ICON_SIZE} color={color} />,
        }}
      />
      <Tabs.Screen
        name="Orders"
        component={OrdersStack}
        options={{
          title: 'طلباتي',
          tabBarIcon: ({ color }) => <Package size={TAB_ICON_SIZE} color={color} />,
        }}
      />
      <Tabs.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: 'الإشعارات',
          tabBarIcon: ({ color }) => <Bell size={TAB_ICON_SIZE} color={color} />,
        }}
      />
      <Tabs.Screen
        name="ProfileTab"
        component={ProfileStack}
        options={{
          title: 'حسابي',
          tabBarIcon: ({ color }) => <User size={TAB_ICON_SIZE} color={color} />,
        }}
      />
    </Tabs.Navigator>
  );
}
