import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fontFamilies, spacing } from '../theme/tokens';

export function RegisterScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>إنشاء حساب جديد</Text>
        <Text style={styles.placeholder}>
          سيتم بناء هذه الشاشة في Phase 0 - يوم 7 (Mobile bootstrap).
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  content: { flex: 1, padding: spacing.xl, justifyContent: 'center', alignItems: 'center' },
  title: {
    fontSize: 24,
    fontFamily: fontFamilies.heading,
    fontWeight: '900',
    marginBottom: spacing.lg,
  },
  placeholder: { fontSize: 14, color: colors.text.muted, textAlign: 'center' },
});
