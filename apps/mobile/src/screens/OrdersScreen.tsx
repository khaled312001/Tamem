import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fontFamilies, spacing } from '../theme/tokens';

export function OrdersScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>طلباتي</Text>
        <Text style={styles.placeholder}>سيتم تنفيذها في Phase 2 (يوم 18-19).</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { flex: 1, padding: spacing.xl, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontFamily: fontFamilies.heading, fontWeight: '900' },
  placeholder: { fontSize: 14, color: colors.text.muted, marginTop: spacing.md },
});
