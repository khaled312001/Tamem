import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../lib/api';
import { useAuth } from '../stores/auth';
import { colors, fontFamilies, radii, spacing } from '../theme/tokens';

export function LoginScreen() {
  const setSession = useAuth((s) => s.setSession);
  const [phone, setPhone] = useState('+201010254819');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setLoading(true);
    try {
      const res = await api.login(phone, password);
      await setSession(res.user, res.tokens);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل تسجيل الدخول';
      Alert.alert('خطأ', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.content}>
          <Text style={styles.title}>أهلاً بك من جديد</Text>
          <Text style={styles.subtitle}>سجّل دخولك لتبدأ الطلب</Text>

          <View style={styles.field}>
            <Text style={styles.label}>رقم الهاتف</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              style={styles.input}
              placeholder="+201XXXXXXXXX"
              placeholderTextColor={colors.text.muted}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>كلمة المرور</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={colors.text.muted}
            />
          </View>

          <Pressable
            onPress={onSubmit}
            disabled={loading}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              loading && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.buttonText}>{loading ? 'جاري الدخول…' : 'تسجيل الدخول'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  content: { flex: 1, padding: spacing.xl, justifyContent: 'center' },
  title: {
    fontSize: 28,
    fontWeight: '900',
    fontFamily: fontFamilies.heading,
    color: colors.text.primary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.text.muted,
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
    textAlign: 'center',
  },
  field: { marginBottom: spacing.lg },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text.primary,
    textAlign: 'right',
  },
  button: {
    backgroundColor: colors.brand.red,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.white, fontWeight: '700', fontSize: 16 },
});
