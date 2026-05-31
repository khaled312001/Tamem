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
      initialRouteName="HomeTab"
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
      {/* Match Talabat / Careem / Jahez convention for Arabic apps:
          Home on the LEFT (first visual position), Account on the RIGHT.
          The bottom-tab navigator renders children in declaration order on
          web (no RTL flip), so we declare them in that exact order. */}
      <Tabs.Screen
        name="HomeTab"
        component={HomeStack}
        listeners={({ navigation }) => ({
          // Tapping a tab while you're already inside its nested stack should
          // jump you back to the stack root, not leave you on the deep page.
          // (The default `popToTop` behavior is unreliable on web.)
          tabPress: (e) => {
            const state = navigation.getState();
            if (state?.routes[state.index]?.name === 'HomeTab') {
              e.preventDefault();
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (navigation as any).navigate('HomeTab', { screen: 'Home' });
            }
          },
        })}
        options={{
          title: 'الرئيسية',
          tabBarIcon: ({ color }) => <Home size={TAB_ICON_SIZE} color={color} />,
        }}
      />
      <Tabs.Screen
        name="Orders"
        component={OrdersStack}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            const state = navigation.getState();
            if (state?.routes[state.index]?.name === 'Orders') {
              e.preventDefault();
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (navigation as any).navigate('Orders', { screen: 'OrdersList' });
            }
          },
        })}
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
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            const state = navigation.getState();
            if (state?.routes[state.index]?.name === 'ProfileTab') {
              e.preventDefault();
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (navigation as any).navigate('ProfileTab', { screen: 'Profile' });
            }
          },
        })}
        options={{
          title: 'حسابي',
          tabBarIcon: ({ color }) => <User size={TAB_ICON_SIZE} color={color} />,
        }}
      />
    </Tabs.Navigator>
  );
}
