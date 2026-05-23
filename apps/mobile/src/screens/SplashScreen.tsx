import { StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies } from '../theme/tokens';

export function SplashScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.logo}>
        <Text style={styles.logoText}>ت</Text>
      </View>
      <Text style={styles.brand}>تميم</Text>
      <Text style={styles.tagline}>تميم… التوصيل لعبتنا</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.brand.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: colors.brand.red,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  logoText: {
    color: colors.white,
    fontSize: 48,
    fontFamily: fontFamilies.heading,
    fontWeight: '900',
  },
  brand: {
    color: colors.white,
    fontSize: 36,
    fontWeight: '900',
    marginBottom: 8,
  },
  tagline: {
    color: colors.brand.gold,
    fontSize: 16,
  },
});
