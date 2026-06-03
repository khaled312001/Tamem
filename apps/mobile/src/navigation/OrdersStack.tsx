import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { EasyKashCheckoutScreen } from '../screens/EasyKashCheckoutScreen';
import { OrdersScreen } from '../screens/OrdersScreen';
import { OrderTrackingScreen } from '../screens/OrderTrackingScreen';

export type OrdersStackParamList = {
  OrdersList: undefined;
  OrderTracking: { orderId: string; justCreated?: boolean };
  EasyKashCheckout: { orderId: string };
};

const Stack = createNativeStackNavigator<OrdersStackParamList>();

export function OrdersStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="OrdersList" component={OrdersScreen} />
      <Stack.Screen name="OrderTracking" component={OrderTrackingScreen} />
      <Stack.Screen name="EasyKashCheckout" component={EasyKashCheckoutScreen} />
    </Stack.Navigator>
  );
}
