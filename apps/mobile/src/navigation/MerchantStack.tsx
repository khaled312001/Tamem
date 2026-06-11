import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { MerchantDashboardScreen } from '../screens/merchant/MerchantDashboardScreen';
import { MerchantOrderDetailScreen } from '../screens/merchant/MerchantOrderDetailScreen';
import { MerchantOrdersListScreen } from '../screens/merchant/MerchantOrdersListScreen';
import { MerchantProductsScreen } from '../screens/merchant/MerchantProductsScreen';
import { MerchantProfileScreen } from '../screens/merchant/MerchantProfileScreen';

export type MerchantStackParamList = {
  MerchantDashboard: undefined;
  MerchantOrdersList: undefined;
  MerchantOrderDetail: { orderId: string };
  MerchantProducts: undefined;
  MerchantProfile: undefined;
};

const Stack = createNativeStackNavigator<MerchantStackParamList>();

export function MerchantStack() {
  return (
    <Stack.Navigator initialRouteName="MerchantDashboard" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MerchantDashboard" component={MerchantDashboardScreen} />
      <Stack.Screen name="MerchantOrdersList" component={MerchantOrdersListScreen} />
      <Stack.Screen name="MerchantOrderDetail" component={MerchantOrderDetailScreen} />
      <Stack.Screen name="MerchantProducts" component={MerchantProductsScreen} />
      <Stack.Screen name="MerchantProfile" component={MerchantProfileScreen} />
    </Stack.Navigator>
  );
}
