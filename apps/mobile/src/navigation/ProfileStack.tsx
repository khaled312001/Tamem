import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { EditProfileScreen } from '../screens/EditProfileScreen';
import { PaymentMethodsScreen } from '../screens/PaymentMethodsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SavedAddressesScreen } from '../screens/SavedAddressesScreen';
import { SupportScreen } from '../screens/SupportScreen';

export type ProfileStackParamList = {
  Profile: undefined;
  EditProfile: undefined;
  SavedAddresses: undefined;
  PaymentMethods: undefined;
  Support: undefined;
};

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="SavedAddresses" component={SavedAddressesScreen} />
      <Stack.Screen name="PaymentMethods" component={PaymentMethodsScreen} />
      <Stack.Screen name="Support" component={SupportScreen} />
    </Stack.Navigator>
  );
}
