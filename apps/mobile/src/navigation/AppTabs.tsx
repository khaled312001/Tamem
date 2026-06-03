import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import { Bell, Home, Package, User } from 'lucide-react-native';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NotificationsScreen } from '../screens/NotificationsScreen';
import { api } from '../lib/api';
import { clearAppBadge } from '../lib/push';

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

/** Polls the unread notifications count so the bell tab can show a badge. */
function useUnreadCount(): number {
  const { data } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      try {
        const r = await api.raw.get('/notifications', { params: { pageSize: 100 } });
        const list = (r.data.data ?? []) as Array<{ isRead?: boolean }>;
        return list.filter((n) => !n.isRead).length;
      } catch {
        return 0;
      }
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  return data ?? 0;
}

export function AppTabs() {
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'web' ? 8 : Math.max(insets.bottom, 8);
  const unread = useUnreadCount();

  return (
    <Tabs.Navigator
      initialRouteName="HomeTab"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand.red,
        tabBarInactiveTintColor: colors.text.muted,
        tabBarHideOnKeyboard: true,
        tabBarLabelPosition: 'below-icon',
        tabBarShowLabel: true,
        tabBarStyle: {
          borderTopColor: colors.line,
          backgroundColor: colors.white,
          height: 68 + bottomInset,
          paddingTop: 6,
          paddingBottom: bottomInset,
        },
        tabBarItemStyle: { paddingVertical: 0 },
        tabBarIconStyle: { marginTop: 4, marginBottom: 0 },
        tabBarLabelStyle: {
          fontFamily: fontFamilies.bodyBold,
          fontSize: 12,
          lineHeight: 14,
          marginTop: 2,
          marginBottom: 2,
          includeFontPadding: false,
        },
        tabBarBadgeStyle: {
          backgroundColor: colors.brand.red,
          color: colors.white,
          fontSize: 10,
          fontFamily: fontFamilies.bodyExtraBold,
        },
      }}
    >
      <Tabs.Screen
        name="HomeTab"
        component={HomeStack}
        listeners={({ navigation }) => ({
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
        listeners={() => ({
          tabPress: () => {
            // Clear OS-level badge when the user enters the tab — keeps the
            // device home screen tidy.
            void clearAppBadge();
          },
        })}
        options={{
          title: 'الإشعارات',
          tabBarIcon: ({ color }) => <Bell size={TAB_ICON_SIZE} color={color} />,
          tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
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
