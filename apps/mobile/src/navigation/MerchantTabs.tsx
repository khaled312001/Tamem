import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ClipboardList, Home, Package, User as UserIcon } from 'lucide-react-native';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MerchantDashboardScreen } from '../screens/merchant/MerchantDashboardScreen';
import { MerchantOrdersListScreen } from '../screens/merchant/MerchantOrdersListScreen';
import { MerchantProductsScreen } from '../screens/merchant/MerchantProductsScreen';
import { MerchantProfileScreen } from '../screens/merchant/MerchantProfileScreen';
import { colors, fontFamilies } from '../theme/tokens';

/**
 * Bottom tabs for the MERCHANT role.
 *
 * Under RTL + flex-direction:row, the FIRST source child renders on the
 * visual right. So الرئيسية is registered first to land on the right —
 * matching customer AppTabs convention.
 *
 * `MerchantOrderDetail` is intentionally not a tab — it's a stack screen the
 * orders list pushes onto its own navigator (see MerchantStack), so the tab
 * bar stays four icons wide.
 */
export type MerchantTabsParamList = {
  MerchantDashboard: undefined;
  MerchantOrdersList: undefined;
  MerchantProducts: undefined;
  MerchantProfile: undefined;
};

const Tabs = createBottomTabNavigator<MerchantTabsParamList>();

const TAB_ICON_SIZE = 22;

export function MerchantTabs() {
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'web' ? 8 : Math.max(insets.bottom, 8);

  return (
    <View style={{ flex: 1 }}>
      <Tabs.Navigator
        initialRouteName="MerchantDashboard"
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
        {/* First-registered child lands on the visual RIGHT under RTL.
            Order: الرئيسية → طلباتى → منتجاتى → حسابى. */}
        <Tabs.Screen
          name="MerchantDashboard"
          component={MerchantDashboardScreen}
          options={{
            title: 'الرئيسية',
            tabBarIcon: ({ color }) => <Home size={TAB_ICON_SIZE} color={color} />,
          }}
        />
        <Tabs.Screen
          name="MerchantOrdersList"
          component={MerchantOrdersListScreen}
          options={{
            title: 'طلباتى',
            tabBarIcon: ({ color }) => <ClipboardList size={TAB_ICON_SIZE} color={color} />,
          }}
        />
        <Tabs.Screen
          name="MerchantProducts"
          component={MerchantProductsScreen}
          options={{
            title: 'منتجاتى',
            tabBarIcon: ({ color }) => <Package size={TAB_ICON_SIZE} color={color} />,
          }}
        />
        <Tabs.Screen
          name="MerchantProfile"
          component={MerchantProfileScreen}
          options={{
            title: 'حسابى',
            tabBarIcon: ({ color }) => <UserIcon size={TAB_ICON_SIZE} color={color} />,
          }}
        />
      </Tabs.Navigator>
    </View>
  );
}
