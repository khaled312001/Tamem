import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { LoginScreen } from '../screens/LoginScreen';

export type AuthStackParamList = {
  Login: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStack() {
  return (
    // Google is the only way in, for signing in and for new accounts alike.
    // No password form, no "forgot password", no role choice, no merchant
    // signup: merchants work from the web merchant panel.
    <Stack.Navigator screenOptions={{ headerShown: false, freezeOnBlur: true }}>
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}
