import { useNavigation } from '@react-navigation/native';
import { useMutation } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Camera, ChevronDown, ChevronUp, Lock, Mail, Phone, User } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

interface UserExt {
  name?: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
}

/**
 * Posts the picked image to /uploads (multipart) and returns the hosted URL.
 * Works on both web (Blob from URI) and native (FormData with uri).
 */
async function uploadAvatar(uri: string): Promise<string> {
  const form = new FormData();

  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    const blob = await res.blob();
    form.append('file', blob, 'avatar.jpg');
  } else {
    // RN FormData accepts { uri, name, type } as a synthetic file
    form.append('file', {
      uri,
      name: 'avatar.jpg',
      type: 'image/jpeg',
    } as unknown as Blob);
  }

  const res = await api.raw.post('/uploads', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.data.url as string;
}

export function EditProfileScreen() {
  const navigation = useNavigation();
  const user = useAuth((s) => s.user) as (UserExt & { id: string }) | null;
  const setUser = useAuth((s) => s.setUser);

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Password-change section — collapsed by default so it doesn't clutter
  // the main edit-profile screen for users who don't intend to change it.
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const changePassword = useMutation({
    mutationFn: async () => {
      if (newPassword.length < 8) {
        throw new Error('كلمة السر الجديدة 8 أحرف على الأقل');
      }
      if (newPassword !== confirmPassword) {
        throw new Error('كلمتا السر غير متطابقتين');
      }
      const res = await api.raw.post('/me/change-password', {
        currentPassword,
        newPassword,
      });
      return res.data.data;
    },
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwOpen(false);
      Alert.alert('تم التغيير', 'تم تحديث كلمة السر بنجاح');
    },
    onError: (err: unknown) => {
      Alert.alert('خطأ', err instanceof Error ? err.message : 'فشل تغيير كلمة السر');
    },
  });

  const pickAvatar = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('لا يوجد إذن', 'فعّل صلاحية الصور من الإعدادات');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (result.canceled || !result.assets?.[0]) return;
      setUploadingAvatar(true);
      const url = await uploadAvatar(result.assets[0].uri);
      setAvatarUrl(url);
    } catch (err) {
      Alert.alert('خطأ', err instanceof Error ? err.message : 'فشل رفع الصورة');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = {};
      if (name.trim() && name !== user?.name) body.name = name.trim();
      if (email.trim() && email !== user?.email) body.email = email.trim();
      if (avatarUrl && avatarUrl !== user?.avatarUrl) body.avatarUrl = avatarUrl;
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

  const initial = (name || user?.name || 'ت').charAt(0);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader title="تعديل البيانات الشخصية" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Avatar with picker */}
          <View style={styles.avatarWrap}>
            <Pressable
              onPress={pickAvatar}
              style={({ pressed }) => [styles.avatar, pressed && { opacity: 0.85 }]}
            >
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarText}>{initial}</Text>
              )}
              <View style={styles.avatarBadge}>
                {uploadingAvatar ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Camera size={16} color={colors.white} />
                )}
              </View>
            </Pressable>
            <Text style={styles.avatarHint}>اضغط على الصورة لتغييرها</Text>
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

          {/* Password-change drawer — collapsed by default. Posts to the
              existing /me/change-password endpoint so the same flow works
              for both Google + phone-registered users (the backend rejects
              with NO_PASSWORD when the account has no password yet). */}
          <Pressable
            onPress={() => setPwOpen((v) => !v)}
            style={({ pressed }) => [styles.pwToggle, pressed && { opacity: 0.85 }]}
          >
            <Lock size={16} color={colors.brand.red} />
            <Text style={styles.pwToggleText}>تغيير كلمة السر</Text>
            {pwOpen ? (
              <ChevronUp size={18} color={colors.text.muted} />
            ) : (
              <ChevronDown size={18} color={colors.text.muted} />
            )}
          </Pressable>

          {pwOpen && (
            <View style={styles.pwBox}>
              <IconField
                Icon={Lock}
                placeholder="كلمة السر الحالية"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
                autoComplete="password"
              />
              <IconField
                Icon={Lock}
                placeholder="كلمة السر الجديدة (8 أحرف على الأقل)"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                autoComplete="password-new"
              />
              <IconField
                Icon={Lock}
                placeholder="تأكيد كلمة السر الجديدة"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoComplete="password-new"
              />
              <GradientButton
                label={changePassword.isPending ? 'جاري التحديث…' : 'تحديث كلمة السر'}
                onPress={() => changePassword.mutate()}
                loading={changePassword.isPending}
              />
            </View>
          )}

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

const AVATAR = 96;
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  avatarWrap: { alignItems: 'center', marginBottom: spacing.lg },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: colors.brand.red,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: colors.white, fontSize: 38, fontFamily: fontFamilies.headingBlack },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    insetInlineEnd: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.brand.dark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  avatarHint: {
    marginTop: spacing.sm,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
  },
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
  pwToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pwToggleText: {
    flex: 1,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
    color: colors.ink,
  },
  pwBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  // legacy class kept to avoid touching all callers (no-op)
  _unused: { display: 'none' as const },
});

void radii; // referenced in case of future use; suppresses unused-var lint
