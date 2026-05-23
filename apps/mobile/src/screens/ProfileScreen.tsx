import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../stores/auth';
import { colors, fontFamilies, radii, spacing } from '../theme/tokens';

export function ProfileScreen() {
  const user = useAuth((s) => s.user);
  const clear = useAuth((s) => s.clear);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>حسابي</Text>
        {user && (
          <View style={styles.card}>
            <Text style={styles.name}>{user.name}</Text>
            <Text style={styles.phone}>{user.phone}</Text>
          </View>
        )}
        <Pressable onPress={() => void clear()} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>تسجيل الخروج</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { flex: 1, padding: spacing.xl },
  title: {
    fontSize: 24,
    fontFamily: fontFamilies.heading,
    fontWeight: '900',
    marginBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  name: { fontSize: 18, fontWeight: '900', marginBottom: spacing.xs },
  phone: { fontSize: 14, color: colors.text.muted },
  logoutBtn: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.brand.red,
    alignItems: 'center',
  },
  logoutText: { color: colors.brand.red, fontWeight: '700' },
});
