import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import { Bell, Home, Package, ShoppingCart, User } from 'lucide-react-native';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CartScreen } from '../screens/CartScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { api } from '../lib/api';
import { clearAppBadge } from '../lib/push';
import { useCart } from '../stores/cart';

import { HomeStack } from './HomeStack';
import { OrdersStack } from './OrdersStack';
import { ProfileStack } from './ProfileStack';

import { colors, fontFamilies } from '../theme/tokens';

export type AppTabsParamList = {
  HomeTab: undefined;
  CartTab: undefined;
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

/** Cart icon with the live item-count badge so the customer can see
 *  there's something in the basket without opening the tab. */
function CartWithBadge({ color, count }: { color: string; count: number }) {
  const label = count > 99 ? '99+' : String(count);
  return (
    <View style={badgeStyles.wrap}>
      <ShoppingCart size={TAB_ICON_SIZE} color={color} />
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

/** The centre Home tab — a raised red circle ("دائرة الرئيسية") that anchors the
 *  bar, per the approved design. Active or not it stays branded so it always
 *  reads as "home base". */
function HomeCircle({ focused }: { focused: boolean }) {
  return (
    <View style={[homeStyles.circle, focused && homeStyles.circleActive]}>
      <Home size={24} color={colors.white} />
    </View>
  );
}

const homeStyles = StyleSheet.create({
  circle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.brand.red,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -18, // lift it above the bar so it reads as a centre anchor
    borderWidth: 4,
    borderColor: colors.white,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 6px 16px rgba(224,48,30,0.4)' }
      : {
          shadowColor: '#E0301E',
          shadowOpacity: 0.4,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 6 },
          elevation: 10,
        }),
  },
  circleActive: { backgroundColor: '#C42817' },
});

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
  const cartCount = useCart().count;

  return (
    <View style={{ flex: 1 }}>
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
            // Let the raised centre Home circle spill above the bar edge.
            overflow: 'visible',
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
        {/* CartTab is a redirect — taps always send the user to HomeTab > Cart
            because CartScreen lives inside HomeStack (it shares product /
            checkout routes with the rest of the catalog). We still register
            a component prop because React Navigation requires one; in
            practice the component is never actually rendered because the
            tabPress listener calls preventDefault first. */}
        <Tabs.Screen
          name="CartTab"
          component={CartScreen}
          listeners={({ navigation }) => ({
            tabPress: (e) => {
              e.preventDefault();
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (navigation as any).navigate('HomeTab', { screen: 'Cart' });
            },
          })}
          options={{
            title: 'السلة',
            tabBarIcon: ({ color }) => <CartWithBadge color={color} count={cartCount} />,
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
        {/* Home sits in the CENTRE as a raised red circle — the anchor of the
            bar per the approved design. */}
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
            tabBarIcon: ({ focused }) => <HomeCircle focused={focused} />,
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
    </View>
  );
}
