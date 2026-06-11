import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Home, MapPin, Plus, Star, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
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
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

interface SavedAddress {
  id: string;
  label: string;
  address: string;
  lat?: number | null;
  lng?: number | null;
  notes?: string | null;
  isDefault: boolean;
  createdAt: string;
}

// Only the two canonical labels — "ماما" was removed per product request
// to keep the picker focused. The free-text input below still lets the
// customer name an address whatever they want.
const QUICK_LABELS: { value: string; icon: typeof Home }[] = [
  { value: 'البيت', icon: Home },
  { value: 'الشغل', icon: Briefcase },
];

export function SavedAddressesScreen() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  const { data: list = [], isLoading } = useQuery<SavedAddress[]>({
    queryKey: ['my-addresses'],
    queryFn: () => api.raw.get('/me/addresses').then((r) => r.data.data),
  });

  const createMut = useMutation({
    mutationFn: () =>
      api.raw.post('/me/addresses', {
        label: label.trim(),
        address: address.trim(),
        notes: notes.trim() || undefined,
        isDefault: list.length === 0, // first address becomes default automatically
      }),
    onSuccess: () => {
      setLabel('');
      setAddress('');
      setNotes('');
      setAdding(false);
      qc.invalidateQueries({ queryKey: ['my-addresses'] });
    },
    onError: (err) => Alert.alert('خطأ', err instanceof Error ? err.message : 'فشل الحفظ'),
  });

  const setDefaultMut = useMutation({
    // Dedicated endpoint — clearer audit trail and idempotent (re-firing on
    // the current default is a no-op).
    mutationFn: (id: string) => api.raw.post(`/me/addresses/${id}/set-default`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-addresses'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.raw.delete(`/me/addresses/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-addresses'] }),
  });

  const canSave = label.trim().length >= 1 && address.trim().length >= 2;

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader title="عناويني المحفوظة" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.banner}>
            <MapPin size={18} color={colors.brand.red} />
            <Text style={styles.bannerText}>
              العنوان الافتراضي يُستخدم تلقائياً عند إنشاء طلب جديد
            </Text>
          </View>

          {isLoading ? (
            <ActivityIndicator color={colors.brand.red} style={{ marginVertical: spacing.xl }} />
          ) : list.length === 0 && !adding ? (
            <View style={styles.empty}>
              <MapPin size={40} color={colors.text.muted} />
              <Text style={styles.emptyTitle}>مفيش عناوين محفوظة لسه</Text>
              <Text style={styles.emptySub}>أضف عنوان لتوفر الوقت في طلباتك القادمة</Text>
            </View>
          ) : (
            list.map((addr) => (
              <View key={addr.id} style={styles.card}>
                <View style={styles.cardIcon}>
                  <IconForLabel label={addr.label} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardLabel}>{addr.label}</Text>
                    {addr.isDefault && (
                      <View style={styles.defaultBadge}>
                        <Star size={10} color={colors.white} fill={colors.white} />
                        <Text style={styles.defaultBadgeText}>افتراضي</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.cardAddress} numberOfLines={2}>
                    {addr.address}
                  </Text>
                  {addr.notes && <Text style={styles.cardNotes}>{addr.notes}</Text>}
                  <View style={styles.cardActions}>
                    {!addr.isDefault && (
                      <Pressable
                        onPress={() => setDefaultMut.mutate(addr.id)}
                        style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
                      >
                        <Star size={12} color={colors.brand.red} />
                        <Text style={styles.actionText}>اجعله افتراضي</Text>
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() =>
                        Alert.alert('حذف العنوان', `هل تريد حذف "${addr.label}"؟`, [
                          { text: 'تراجع', style: 'cancel' },
                          {
                            text: 'حذف',
                            style: 'destructive',
                            onPress: () => deleteMut.mutate(addr.id),
                          },
                        ])
                      }
                      style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
                    >
                      <Trash2 size={12} color={colors.danger} />
                      <Text style={[styles.actionText, { color: colors.danger }]}>حذف</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))
          )}

          {adding ? (
            <View style={styles.addForm}>
              <Text style={styles.fieldLabel}>الاسم</Text>
              <View style={styles.quickLabels}>
                {QUICK_LABELS.map((q) => (
                  <Pressable
                    key={q.value}
                    onPress={() => setLabel(q.value)}
                    disabled={createMut.isPending}
                    style={[
                      styles.chip,
                      label === q.value && styles.chipActive,
                      createMut.isPending && { opacity: 0.6 },
                    ]}
                  >
                    <q.icon size={12} color={label === q.value ? colors.white : colors.brand.red} />
                    <Text style={[styles.chipText, label === q.value && styles.chipTextActive]}>
                      {q.value}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                placeholder="أو اكتب اسم مختلف (مثل: شقة الإجازة)"
                placeholderTextColor={colors.text.muted}
                value={label}
                onChangeText={setLabel}
                editable={!createMut.isPending}
                style={[styles.input, createMut.isPending && { opacity: 0.6 }]}
              />

              <Text style={styles.fieldLabel}>العنوان بالتفصيل</Text>
              <TextInput
                placeholder="الشارع، رقم العمارة، الدور، علامة مميزة…"
                placeholderTextColor={colors.text.muted}
                value={address}
                onChangeText={setAddress}
                multiline
                editable={!createMut.isPending}
                style={[styles.textArea, createMut.isPending && { opacity: 0.6 }]}
              />

              <Text style={styles.fieldLabel}>ملاحظات (اختياري)</Text>
              <TextInput
                placeholder="رقم بديل، اتصل قبل الوصول…"
                placeholderTextColor={colors.text.muted}
                value={notes}
                onChangeText={setNotes}
                editable={!createMut.isPending}
                style={[styles.input, createMut.isPending && { opacity: 0.6 }]}
              />

              <View style={styles.formActions}>
                <Pressable
                  onPress={() => {
                    setAdding(false);
                    setLabel('');
                    setAddress('');
                    setNotes('');
                  }}
                  style={styles.cancelBtn}
                >
                  <Text style={styles.cancelText}>إلغاء</Text>
                </Pressable>
                <View style={{ flex: 1 }}>
                  <GradientButton
                    label={createMut.isPending ? 'جاري الحفظ…' : 'حفظ العنوان'}
                    onPress={() => canSave && createMut.mutate()}
                    loading={createMut.isPending}
                    disabled={!canSave}
                  />
                </View>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => setAdding(true)}
              style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
            >
              <Plus size={18} color={colors.brand.red} />
              <Text style={styles.addBtnText}>أضف عنوان جديد</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function IconForLabel({ label }: { label: string }) {
  if (label.includes('بيت') || label.toLowerCase().includes('home'))
    return <Home size={18} color={colors.brand.red} />;
  if (label.includes('شغل') || label.includes('عمل') || label.toLowerCase().includes('work'))
    return <Briefcase size={18} color={colors.brand.red} />;
  return <MapPin size={18} color={colors.brand.red} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand.redLight,
    padding: spacing.md,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
  },
  bannerText: {
    flex: 1,
    color: colors.ink,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    lineHeight: 18,
  },
  empty: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { fontFamily: fontFamilies.bodyExtraBold, color: colors.ink, fontSize: fontSizes.md },
  emptySub: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.sm,
    textAlign: 'center',
  },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: spacing.sm,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardLabel: { fontFamily: fontFamilies.bodyExtraBold, color: colors.ink, fontSize: fontSizes.sm },
  cardAddress: {
    fontFamily: fontFamilies.body,
    color: colors.text.secondary,
    fontSize: fontSizes.xs,
    marginTop: 2,
    lineHeight: 18,
  },
  cardNotes: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.xs,
    marginTop: 4,
    fontStyle: 'italic',
  },
  defaultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.brand.red,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  defaultBadgeText: {
    color: colors.white,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: 9,
  },
  cardActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: {
    fontFamily: fontFamilies.bodyBold,
    color: colors.brand.red,
    fontSize: fontSizes.xs,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand.redLight,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.brand.red,
    borderStyle: 'dashed',
  },
  addBtnText: {
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
  },
  addForm: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  fieldLabel: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyBold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  quickLabels: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.white,
    borderColor: colors.brand.red,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  chipActive: { backgroundColor: colors.brand.red },
  chipText: { color: colors.brand.red, fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.xs },
  chipTextActive: { color: colors.white },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line2,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.sm,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.text.primary,
    textAlign: 'right',
  },
  textArea: {
    backgroundColor: colors.surface,
    borderColor: colors.line2,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.sm,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.text.primary,
    textAlign: 'right',
    textAlignVertical: 'top',
    minHeight: 72,
  },
  formActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    alignItems: 'center',
  },
  cancelBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  cancelText: {
    fontFamily: fontFamilies.bodyBold,
    color: colors.text.muted,
    fontSize: fontSizes.sm,
  },
});
