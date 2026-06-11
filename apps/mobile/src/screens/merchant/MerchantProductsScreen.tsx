/**
 * MerchantProductsScreen
 *
 * Catalogue manager for the merchant's own products. Lists products from
 * `/merchant/products` with a row-level availability toggle and an edit
 * action. A floating "+ منتج جديد" FAB opens a modal form (nameAr, name,
 * price, unit, isAvailable) which POSTs to create; the same form is used
 * by the edit modal which PATCHes the selected product.
 *
 * Self-contained — no imports from customer screens. Inputs are kept as
 * controlled `TextInput`s for the keystroke clarity merchants need when
 * entering prices.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Pencil, Plus, ShoppingBag } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../lib/api';
import { showToast } from '../../lib/toast';
import { colors, fontFamilies, fontSizes, radii, shadows, spacing } from '../../theme/tokens';

interface MerchantProduct {
  id: string;
  name?: string | null;
  nameAr?: string | null;
  price: number;
  unit?: string | null;
  isAvailable: boolean;
}

interface ProductFormState {
  nameAr: string;
  name: string;
  price: string;
  unit: string;
  isAvailable: boolean;
}

const EMPTY_FORM: ProductFormState = {
  nameAr: '',
  name: '',
  price: '',
  unit: '',
  isAvailable: true,
};

interface ProductPayload {
  nameAr: string;
  name: string;
  price: number;
  unit: string;
  isAvailable: boolean;
}

function toPayload(form: ProductFormState): ProductPayload | { error: string } {
  const nameAr = form.nameAr.trim();
  const name = form.name.trim();
  const unit = form.unit.trim();
  const price = Number(form.price.replace(',', '.'));

  if (!nameAr) return { error: 'الاسم العربى مطلوب' };
  if (!name) return { error: 'الاسم الإنجليزى مطلوب' };
  if (!unit) return { error: 'وحدة البيع مطلوبة' };
  if (!Number.isFinite(price) || price <= 0) return { error: 'برجاء إدخال سعر صحيح' };

  return { nameAr, name, unit, price, isAvailable: form.isAvailable };
}

export function MerchantProductsScreen() {
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<MerchantProduct | null>(null);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);

  const productsQuery = useQuery<MerchantProduct[]>({
    queryKey: ['merchant', 'products'],
    queryFn: async () => {
      const res = await api.raw.get('/merchant/products');
      return (res.data.data ?? []) as MerchantProduct[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Sync the form when the edit target changes.
  useEffect(() => {
    if (editing) {
      setForm({
        nameAr: editing.nameAr ?? '',
        name: editing.name ?? '',
        price: String(editing.price ?? ''),
        unit: editing.unit ?? '',
        isAvailable: editing.isAvailable,
      });
    }
  }, [editing]);

  const reportError = (err: unknown, fallback: string) => {
    const message = err instanceof Error ? err.message : fallback;
    try {
      showToast({ title: fallback, message, tone: 'error' });
    } catch {
      Alert.alert(fallback, message);
    }
  };

  const createMut = useMutation({
    mutationFn: (payload: ProductPayload) => api.raw.post('/merchant/products', payload),
    onSuccess: () => {
      showToast({ title: 'تم إضافة المنتج', tone: 'success' });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      void qc.invalidateQueries({ queryKey: ['merchant', 'products'] });
      void qc.invalidateQueries({ queryKey: ['merchant', 'me'] });
    },
    onError: (err) => reportError(err, 'تعذّر إضافة المنتج'),
  });

  const updateMut = useMutation({
    mutationFn: (vars: { id: string; payload: Partial<ProductPayload> }) =>
      api.raw.patch(`/merchant/products/${vars.id}`, vars.payload),
    onSuccess: () => {
      showToast({ title: 'تم تحديث المنتج', tone: 'success' });
      setEditing(null);
      setForm(EMPTY_FORM);
      void qc.invalidateQueries({ queryKey: ['merchant', 'products'] });
    },
    onError: (err) => reportError(err, 'تعذّر تحديث المنتج'),
  });

  const toggleAvailability = (product: MerchantProduct, next: boolean) => {
    updateMut.mutate({ id: product.id, payload: { isAvailable: next } });
  };

  const onSubmit = () => {
    const result = toPayload(form);
    if ('error' in result) {
      Alert.alert('بيانات ناقصة', result.error);
      return;
    }
    if (editing) {
      updateMut.mutate({ id: editing.id, payload: result });
    } else {
      createMut.mutate(result);
    }
  };

  const closeModal = () => {
    setCreateOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const products = productsQuery.data ?? [];
  const modalOpen = createOpen || editing !== null;
  const submitBusy = createMut.isPending || updateMut.isPending;

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>منتجات المتجر</Text>
        <Text style={styles.headerCount}>
          {Number(products.length).toLocaleString('ar-EG')} منتج
        </Text>
      </View>

      <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[
          styles.listPad,
          products.length === 0 && { flexGrow: 1, justifyContent: 'center' },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={productsQuery.isFetching && !productsQuery.isLoading}
            onRefresh={() => productsQuery.refetch()}
            tintColor={colors.brand.red}
          />
        }
        renderItem={({ item }) => (
          <View style={[styles.card, shadows.sm]}>
            <View style={styles.cardMain}>
              <Text style={styles.productName} numberOfLines={2}>
                {item.nameAr || item.name || 'منتج'}
              </Text>
              <View style={styles.metaRow}>
                <Text style={styles.productPrice}>
                  {Number(item.price ?? 0).toLocaleString('ar-EG')} ج.م
                </Text>
                {item.unit ? <Text style={styles.productUnit}>/ {item.unit}</Text> : null}
              </View>
            </View>
            <View style={styles.cardActions}>
              <View style={styles.toggleWrap}>
                <Text style={styles.toggleLabel}>{item.isAvailable ? 'متاح' : 'غير متاح'}</Text>
                <Switch
                  value={item.isAvailable}
                  onValueChange={(v) => toggleAvailability(item, v)}
                  trackColor={{ false: colors.line2, true: colors.success }}
                  thumbColor={colors.white}
                />
              </View>
              <Pressable
                onPress={() => setEditing(item)}
                style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.85 }]}
              >
                <Pencil size={14} color={colors.brand.red} />
                <Text style={styles.editBtnText}>تعديل</Text>
              </Pressable>
            </View>
          </View>
        )}
        ListEmptyComponent={
          productsQuery.isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.brand.red} />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <ShoppingBag size={28} color={colors.brand.red} />
              </View>
              <Text style={styles.emptyTitle}>لا توجد منتجات بعد</Text>
              <Text style={styles.emptySubtitle}>
                ابدأ بإضافة أول منتج لمتجرك من زر &quot;+ منتج جديد&quot;.
              </Text>
            </View>
          )
        }
      />

      <Pressable
        onPress={() => {
          setEditing(null);
          setForm(EMPTY_FORM);
          setCreateOpen(true);
        }}
        style={({ pressed }) => [
          styles.fab,
          shadows.brand,
          pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] },
        ]}
      >
        <Plus size={18} color={colors.white} />
        <Text style={styles.fabText}>منتج جديد</Text>
      </Pressable>

      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, shadows.xl]}>
            <Text style={styles.modalTitle}>{editing ? 'تعديل المنتج' : 'إضافة منتج جديد'}</Text>

            <FormField
              label="الاسم بالعربية"
              value={form.nameAr}
              onChangeText={(v) => setForm((s) => ({ ...s, nameAr: v }))}
              placeholder="مثال: زجاجة مياه ٠٫٥ لتر"
            />
            <FormField
              label="الاسم بالإنجليزية"
              value={form.name}
              onChangeText={(v) => setForm((s) => ({ ...s, name: v }))}
              placeholder="Example: Water Bottle 0.5L"
            />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <FormField
                  label="السعر (ج.م)"
                  value={form.price}
                  onChangeText={(v) => setForm((s) => ({ ...s, price: v }))}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <FormField
                  label="الوحدة"
                  value={form.unit}
                  onChangeText={(v) => setForm((s) => ({ ...s, unit: v }))}
                  placeholder="قطعة / كيلو / لتر"
                />
              </View>
            </View>

            <View style={styles.availabilityRow}>
              <Text style={styles.formLabel}>متاح للبيع</Text>
              <Switch
                value={form.isAvailable}
                onValueChange={(v) => setForm((s) => ({ ...s, isAvailable: v }))}
                trackColor={{ false: colors.line2, true: colors.success }}
                thumbColor={colors.white}
              />
            </View>

            {!form.isAvailable ? (
              <View style={styles.hintRow}>
                <CircleAlert size={14} color={colors.brand.gold} />
                <Text style={styles.hintText}>
                  المنتج سيظهر للعملاء ولكن لن يستطيعوا إضافته للسلة.
                </Text>
              </View>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable
                onPress={closeModal}
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalCancel,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.modalCancelText}>إلغاء</Text>
              </Pressable>
              <Pressable
                onPress={onSubmit}
                disabled={submitBusy}
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalConfirm,
                  (pressed || submitBusy) && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.modalConfirmText}>
                  {submitBusy ? 'جارٍ الحفظ…' : editing ? 'حفظ التعديلات' : 'إضافة'}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

interface FormFieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad' | 'numeric';
}

function FormField({ label, value, onChangeText, placeholder, keyboardType }: FormFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text.placeholder}
        keyboardType={keyboardType ?? 'default'}
        style={styles.input}
        textAlign="right"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontFamily: fontFamilies.headingBlack,
    fontSize: fontSizes.xl,
    color: colors.ink,
  },
  headerCount: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xs,
    color: colors.text.muted,
  },
  listPad: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
  loading: { paddingVertical: spacing.xl, alignItems: 'center' },
  // Card
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  cardMain: { gap: 4 },
  productName: {
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.md,
    color: colors.ink,
  },
  metaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  productPrice: {
    fontFamily: fontFamilies.headingBlack,
    color: colors.brand.red,
    fontSize: fontSizes.lg,
  },
  productUnit: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.xs,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  toggleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  toggleLabel: {
    fontFamily: fontFamilies.bodyBold,
    color: colors.text.secondary,
    fontSize: fontSizes.xs,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.brand.redLight,
  },
  editBtnText: {
    fontFamily: fontFamilies.headingBold,
    color: colors.brand.red,
    fontSize: fontSizes.xs,
  },
  // Empty
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: radii.xl,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontFamily: fontFamilies.headingBlack,
    color: colors.ink,
    fontSize: fontSizes.lg,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.sm,
    textAlign: 'center',
  },
  // FAB
  fab: {
    position: 'absolute',
    bottom: spacing.lg,
    end: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.brand.red,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderRadius: radii.pill,
  },
  fabText: {
    color: colors.white,
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.sm,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.alpha.black60,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: {
    fontFamily: fontFamilies.headingBlack,
    color: colors.ink,
    fontSize: fontSizes.lg,
  },
  row: { flexDirection: 'row', gap: spacing.sm },
  field: { gap: 6 },
  formLabel: {
    fontFamily: fontFamilies.bodyBold,
    color: colors.text.secondary,
    fontSize: fontSizes.xs,
  },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.ink,
    writingDirection: 'rtl',
  },
  availabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.warningLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  hintText: {
    flex: 1,
    fontFamily: fontFamilies.body,
    color: colors.text.secondary,
    fontSize: fontSizes.xs,
  },
  modalActions: { flexDirection: 'row', gap: spacing.sm },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  modalCancel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  modalCancelText: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
    color: colors.ink,
  },
  modalConfirm: { backgroundColor: colors.brand.red },
  modalConfirmText: {
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.sm,
    color: colors.white,
  },
});
