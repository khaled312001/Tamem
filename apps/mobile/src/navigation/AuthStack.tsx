import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { LoginScreen } from '../screens/LoginScreen';
import { MerchantSignupScreen } from '../screens/MerchantSignupScreen';
import { RoleChoiceScreen } from '../screens/RoleChoiceScreen';

export type AuthStackParamList = {
  RoleChoice: undefined;
  Login: { initialRole?: 'CUSTOMER' | 'MERCHANT' } | undefined;
  MerchantSignup: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStack() {
  return (
    // Sign in with a phone/email and password, or with Google. There is no OTP
    // anywhere: no verification code on login, and no reset-code screen —
    // "forgot password" tells the customer to ask the office, which is who
    // actually changes it. Manual registration is gone too.
    // Start straight at Login — the app no longer asks "عميل أم تاجر؟" up front;
    // customers log in directly and merchants use the merchant-signup link.
    // RoleChoice stays registered (deep links / merchant flow may still push it).
    <Stack.Navigator
      screenOptions={{ headerShown: false, freezeOnBlur: true }}
      initialRouteName="Login"
    >
      <Stack.Screen name="RoleChoice" component={RoleChoiceScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="MerchantSignup" component={MerchantSignupScreen} />
    </Stack.Navigator>
  );
}
