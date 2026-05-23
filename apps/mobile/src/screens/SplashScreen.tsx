import { Image, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/tokens';

export function SplashScreen() {
  return (
    <View style={styles.container}>
      <Image source={require('../assets/logo.jpg')} style={styles.logo} resizeMode="contain" />
      <Text style={styles.tagline}>توصيلك في أمان معانا</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 260,
    height: 260,
    marginBottom: 16,
  },
  tagline: {
    color: colors.brand.gray,
    fontSize: 16,
    fontWeight: '700',
  },
});
