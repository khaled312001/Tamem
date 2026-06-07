import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { CartCheckoutScreen } from '../screens/CartCheckoutScreen';
import { CartScreen } from '../screens/CartScreen';
import { DeliveryServicesScreen } from '../screens/DeliveryServicesScreen';
import { DynamicServiceFlowScreen } from '../screens/DynamicServiceFlowScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { MerchantDetailScreen } from '../screens/MerchantDetailScreen';
import { MerchantFlowScreen } from '../screens/MerchantFlowScreen';
import { NearbyMapScreen } from '../screens/NearbyMapScreen';
import { ProductDetailScreen } from '../screens/ProductDetailScreen';
import { ShippingFlowScreen } from '../screens/ShippingFlowScreen';
import { StoresListScreen } from '../screens/StoresListScreen';

export type HomeStackParamList = {
  Home: undefined;
  StoresList: { categoryId?: string } | undefined;
  NearbyMap: { search?: string } | undefined;
  MerchantDetail: { merchantId: string };
  ProductDetail: { productId: string };
  Cart: undefined;
  CartCheckout: undefined;
  DynamicServiceFlow: { serviceKey?: string; serviceId?: string; merchantId?: string };
  DeliveryServices: undefined;
  ShippingFlow: undefined;
  MerchantFlow: undefined;
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

export function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="StoresList" component={StoresListScreen} />
      <Stack.Screen name="NearbyMap" component={NearbyMapScreen} />
      <Stack.Screen name="MerchantDetail" component={MerchantDetailScreen} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
      <Stack.Screen name="Cart" component={CartScreen} />
      <Stack.Screen name="CartCheckout" component={CartCheckoutScreen} />
      <Stack.Screen name="DynamicServiceFlow" component={DynamicServiceFlowScreen} />
      <Stack.Screen name="DeliveryServices" component={DeliveryServicesScreen} />
      <Stack.Screen name="ShippingFlow" component={ShippingFlowScreen} />
      <Stack.Screen name="MerchantFlow" component={MerchantFlowScreen} />
    </Stack.Navigator>
  );
}
