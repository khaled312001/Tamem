import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { MerchantSignupScreen } from '../screens/MerchantSignupScreen';
import { OtpVerifyScreen } from '../screens/OtpVerifyScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { RoleChoiceScreen } from '../screens/RoleChoiceScreen';

export type AuthStackParamList = {
  RoleChoice: undefined;
  Login: { initialRole?: 'CUSTOMER' | 'MERCHANT' } | undefined;
  Register: { initialRole?: 'CUSTOMER' | 'MERCHANT' } | undefined;
  OtpVerify: { phone: string };
  ForgotPassword: undefined;
  MerchantSignup: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="RoleChoice">
      <Stack.Screen name="RoleChoice" component={RoleChoiceScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="OtpVerify" component={OtpVerifyScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="MerchantSignup" component={MerchantSignupScreen} />
    </Stack.Navigator>
  );
}
