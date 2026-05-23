import { useNavigation } from '@react-navigation/native';
import { useMutation } from '@tanstack/react-query';
import { Mail, Phone, User } from 'lucide-react-native';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '../components/GradientButton';
import { IconField } from '../components/IconField';
import { ScreenHeader } from '../components/ScreenHeader';
import { api } from '../lib/api';
import { useAuth } from '../stores/auth';
import { colors, fontFamilies, fontSizes, spacing } from '../theme/tokens';

export function EditProfileScreen() {
  const navigation = useNavigation();
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = {};
      if (name.trim() && name !== user?.name) body.name = name.trim();
      if (email.trim() && email !== user?.email) body.email = email.trim();
      if (Object.keys(body).length === 0) return user;
      const res = await api.raw.patch('/me', body);
      return res.data.data;
    },
    onSuccess: (updated) => {
      if (updated) setUser(updated);
      Alert.alert('تم الحفظ', 'تم تحديث بياناتك بنجاح');
      navigation.goBack();
    },
    onError: (err: unknown) => {
      Alert.alert('خطأ', err instanceof Error ? err.message : 'فشل التحديث');
    },
  });

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader title="تعديل البيانات الشخصية" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(name || user?.name || 'ت').charAt(0)}</Text>
          </View>

          <IconField
            Icon={User}
            placeholder="الاسم بالكامل"
            value={name}
            onChangeText={setName}
            autoComplete="name"
          />
          <IconField
            Icon={Phone}
            placeholder="رقم الهاتف"
            value={user?.phone ?? ''}
            editable={false}
          />
          <IconField
            Icon={Mail}
            placeholder="البريد الإلكتروني (اختياري)"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoComplete="email"
            autoCapitalize="none"
          />

          <Text style={styles.hint}>رقم الهاتف لا يمكن تعديله — تواصل مع الإدارة لتغييره.</Text>

          <GradientButton
            label={save.isPending ? 'جاري الحفظ…' : 'حفظ التغييرات'}
            onPress={() => save.mutate()}
            loading={save.isPending}
          />

          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.cancelText}>إلغاء</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.brand.red,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  avatarText: { color: colors.white, fontSize: 36, fontFamily: fontFamilies.headingBlack },
  hint: {
    color: colors.text.muted,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.body,
    textAlign: 'center',
    marginBottom: spacing.lg,
    marginTop: spacing.xs,
  },
  cancel: { alignItems: 'center', marginTop: spacing.md, padding: spacing.sm },
  cancelText: {
    color: colors.text.muted,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
  },
});
