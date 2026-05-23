import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Building2, Home, MapPin } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '../components/GradientButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { api } from '../lib/api';
import { useAuth } from '../stores/auth';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

interface MeResponse {
  city?: string | null;
  governorate?: string | null;
  defaultAddress?: string | null;
}

export function SavedAddressesScreen() {
  const navigation = useNavigation();
  const setUser = useAuth((s) => s.setUser);
  const user = useAuth((s) => s.user);

  const [city, setCity] = useState('');
  const [governorate, setGovernorate] = useState('قنا');
  const [address, setAddress] = useState('');

  const { data: me } = useQuery<MeResponse>({
    queryKey: ['me'],
    queryFn: () => api.raw.get('/me').then((r) => r.data.data),
  });

  useEffect(() => {
    if (me) {
      setCity(me.city ?? '');
      setGovernorate(me.governorate ?? 'قنا');
      setAddress(me.defaultAddress ?? '');
    }
  }, [me]);

  const save = useMutation({
    mutationFn: () =>
      api.raw.patch('/me', {
        city: city.trim() || undefined,
        governorate: governorate.trim() || undefined,
        defaultAddress: address.trim() || undefined,
      }),
    onSuccess: (res) => {
      const updated = res.data.data;
      if (user && updated) setUser({ ...user, ...updated });
      Alert.alert('تم الحفظ', 'تم تحديث عنوانك');
      navigation.goBack();
    },
    onError: (err: unknown) => {
      Alert.alert('خطأ', err instanceof Error ? err.message : 'فشل الحفظ');
    },
  });

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader title="عناويني المحفوظة" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.banner}>
            <MapPin size={20} color={colors.brand.red} />
            <Text style={styles.bannerText}>
              العنوان الافتراضي يُستخدم تلقائياً في طلباتك القادمة
            </Text>
          </View>

          <View style={styles.chips}>
            {(['قنا', 'الأقصر', 'أسوان', 'البحر الأحمر'] as const).map((g) => {
              const active = governorate === g;
              return (
                <Pressable
                  key={g}
                  onPress={() => setGovernorate(g)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Building2 size={14} color={active ? colors.white : colors.brand.red} />
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{g}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>المدينة / المركز</Text>
          <TextInput
            placeholder="مثال: قفط"
            placeholderTextColor={colors.text.muted}
            value={city}
            onChangeText={setCity}
            style={styles.input}
          />

          <Text style={styles.fieldLabel}>العنوان بالتفصيل</Text>
          <TextInput
            placeholder="الشارع، رقم المنزل، علامة مميزة…"
            placeholderTextColor={colors.text.muted}
            value={address}
            onChangeText={setAddress}
            multiline
            style={styles.textArea}
          />

          <View style={styles.savedCard}>
            <View style={styles.savedIcon}>
              <Home size={18} color={colors.brand.red} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.savedTitle}>العنوان الحالي</Text>
              <Text style={styles.savedBody}>
                {[address, city, governorate].filter(Boolean).join('، ') || 'لم تضف عنوان بعد'}
              </Text>
            </View>
          </View>

          <GradientButton
            label={save.isPending ? 'جاري الحفظ…' : 'حفظ العنوان'}
            onPress={() => save.mutate()}
            loading={save.isPending}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand.redLight,
    padding: spacing.md,
    borderRadius: radii.lg,
    marginBottom: spacing.lg,
  },
  bannerText: {
    flex: 1,
    color: colors.ink,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    lineHeight: 20,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    borderColor: colors.brand.red,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  chipActive: { backgroundColor: colors.brand.red },
  chipText: { color: colors.brand.red, fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.xs },
  chipTextActive: { color: colors.white },
  fieldLabel: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyBold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.white,
    borderColor: colors.line2,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.text.primary,
    textAlign: 'right',
  },
  textArea: {
    backgroundColor: colors.white,
    borderColor: colors.line2,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.text.primary,
    textAlign: 'right',
    textAlignVertical: 'top',
    minHeight: 96,
  },
  savedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.soft,
    padding: spacing.md,
    borderRadius: radii.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  savedIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedTitle: { fontFamily: fontFamilies.bodyExtraBold, color: colors.ink, fontSize: fontSizes.sm },
  savedBody: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.xs,
    marginTop: 2,
    lineHeight: 18,
  },
});
