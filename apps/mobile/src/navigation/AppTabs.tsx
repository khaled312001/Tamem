import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import { Bell, Home, Package, User } from 'lucide-react-native';
import { Platform, StyleSheet, Text, View } from 'react-native';
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

/**
 * Bell icon with a small red dot overlay when there are unread notifications.
 * We render this manually instead of using React Navigation's built-in
 * `tabBarBadge`, because the underlying `Badge` component pulls in the
 * `color` npm package which crashes on web bundles (`colorString.get is
 * not a function`).
 */
function BellWithBadge({ color, count }: { color: string; count: number }) {
  const label = count > 99 ? '99+' : String(count);
  return (
    <View style={badgeStyles.wrap}>
      <Bell size={TAB_ICON_SIZE} color={color} />
      {count > 0 && (
        <View style={badgeStyles.badge}>
          <Text style={badgeStyles.badgeText} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  wrap: { width: TAB_ICON_SIZE + 14, height: TAB_ICON_SIZE + 4, alignItems: 'center' },
  badge: {
    position: 'absolute',
    top: -4,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#E0301E',
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 14,
    includeFontPadding: false,
  },
});

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
          tabBarIcon: ({ color }) => <BellWithBadge color={color} count={unread} />,
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
