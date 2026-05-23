import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { DynamicServiceFlowScreen } from '../screens/DynamicServiceFlowScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { MerchantDetailScreen } from '../screens/MerchantDetailScreen';
import { NearbyMapScreen } from '../screens/NearbyMapScreen';
import { StoresListScreen } from '../screens/StoresListScreen';

export type HomeStackParamList = {
  Home: undefined;
  StoresList: { categoryId?: string } | undefined;
  NearbyMap: undefined;
  MerchantDetail: { merchantId: string };
  DynamicServiceFlow: { serviceKey?: string; serviceId?: string; merchantId?: string };
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

export function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="StoresList" component={StoresListScreen} />
      <Stack.Screen name="NearbyMap" component={NearbyMapScreen} />
      <Stack.Screen name="MerchantDetail" component={MerchantDetailScreen} />
      <Stack.Screen name="DynamicServiceFlow" component={DynamicServiceFlowScreen} />
    </Stack.Navigator>
  );
}
