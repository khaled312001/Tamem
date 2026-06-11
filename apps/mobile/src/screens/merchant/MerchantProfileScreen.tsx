/**
 * MerchantProfileScreen
 *
 * Read-only store identity card plus the merchant-account action menu.
 * Shows the store's bilingual name, address, governorate, and current
 * rating, then surfaces three actions:
 *   - تعديل بيانات المتجر — placeholder, navigates to a TODO route
 *   - تغيير ساعات العمل — placeholder, navigates to a TODO route
 *   - تسجيل خروج — calls `useAuth().clear()` so the root navigator
 *     bounces the user back to the auth stack.
 *
 * The two placeholder routes intentionally do nothing today — the
 * navigation agent will wire them once the corresponding edit screens
 * ship. We warn via Alert.alert so the merchant gets immediate feedback.
 */
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Clock, LogOut, MapPin, Pencil, Star, Store, X } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../lib/api';
import { showToast } from '../../lib/toast';
import { useAuth } from '../../stores/auth';
import { colors, fontFamilies, fontSizes, radii, shadows, spacing } from '../../theme/tokens';

interface MerchantProfile {
  storeName?: string | null;
  storeNameAr?: string | null;
  addressLine?: string | null;
  governorate?: string | null;
  rating?: number | null;
}

type DialogKind = { kind: 'info'; title: string; body: string } | { kind: 'confirm-logout' };

export function MerchantProfileScreen() {
  const navigation = useNavigation();
  void navigation;
  const clear = useAuth((s) => s.clear);

  // State-driven Modal instead of Alert.alert — the native Alert renders an
  // ugly browser dialog on react-native-web that the user reported as "not
  // working". A custom Modal works identically on both platforms.
  const [dialog, setDialog] = useState<DialogKind | null>(null);

  const query = useQuery<MerchantProfile>({
    queryKey: ['merchant', 'me'],
    queryFn: async () => {
      const res = await api.raw.get('/merchant/me');
      return res.data.data as MerchantProfile;
    },
    staleTime: 5 * 60 * 1000,
  });

  const data = query.data;
  const displayName = data?.storeNameAr || data?.storeName || 'متجرك';
  const subName = data?.storeNameAr && data?.storeName ? data.storeName : null;

  const onEditStore = () =>
    setDialog({
      kind: 'info',
      title: 'قريباً',
      body: 'تعديل بيانات المتجر (الاسم، العنوان، الغلاف) هيكون متاح قريباً من هنا.',
    });

  const onEditHours = () =>
    setDialog({
      kind: 'info',
      title: 'قريباً',
      body: 'تغيير مواعيد العمل اليومية هيكون متاح قريباً من هنا.',
    });

  const onLogout = () => setDialog({ kind: 'confirm-logout' });

  const performLogout = () => {
    setDialog(null);
    clear()
      .then(() => {
        try {
          showToast({ title: 'تم تسجيل الخروج', tone: 'success' });
        } catch {
          /* toast is best-effort */
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'حدث خطأ';
        setDialog({ kind: 'info', title: 'تعذّر تسجيل الخروج', body: message });
      });
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={query.isFetching && !query.isLoading}
            onRefresh={() => {
              // RefreshControl expects a void return — discard the refetch
              // promise and surface errors via toast.
              query.refetch().catch((err) => {
                const message = err instanceof Error ? err.message : undefined;
                showToast({ title: 'تعذّر تحديث البيانات', message, tone: 'error' });
              });
            }}
            tintColor={colors.brand.red}
          />
        }
      >
        <View style={[styles.identityCard, shadows.sm]}>
          <View style={styles.identityHead}>
            <View style={styles.identityIcon}>
              <Store size={22} color={colors.brand.red} />
            </View>
            <View style={{ flex: 1 }}>
              {query.isLoading ? (
                <ActivityIndicator color={colors.brand.red} />
              ) : (
                <>
                  <Text style={styles.identityName} numberOfLines={2}>
                    {displayName}
                  </Text>
                  {subName ? (
                    <Text style={styles.identitySubName} numberOfLines={1}>
                      {subName}
                    </Text>
                  ) : null}
                </>
              )}
            </View>
          </View>

          <View style={styles.identityMetaRow}>
            <View style={styles.identityMeta}>
              <MapPin size={14} color={colors.text.secondary} />
              <Text style={styles.identityMetaText} numberOfLines={1}>
                {data?.addressLine ?? 'العنوان غير محدد'}
              </Text>
            </View>
            {data?.governorate ? (
              <View style={styles.identityMeta}>
                <Text style={styles.identityMetaText}>{data.governorate}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.ratingRow}>
            <Star size={16} color={colors.brand.gold} fill={colors.brand.gold} />
            <Text style={styles.ratingValue}>
              {data?.rating != null ? Number(data.rating).toFixed(1) : '—'}
            </Text>
            <Text style={styles.ratingLabel}>تقييم العملاء</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>الإعدادات</Text>

        <View style={styles.menuCard}>
          <MenuItem
            Icon={Pencil}
            label="تعديل بيانات المتجر"
            sublabel="الاسم، العنوان، صورة الغلاف"
            onPress={onEditStore}
          />
          <View style={styles.menuDivider} />
          <MenuItem
            Icon={Clock}
            label="تغيير ساعات العمل"
            sublabel="مواعيد الفتح والإغلاق يومياً"
            onPress={onEditHours}
          />
          <View style={styles.menuDivider} />
          <MenuItem Icon={LogOut} label="تسجيل خروج" destructive onPress={onLogout} />
        </View>
      </ScrollView>

      {/* Cross-platform action modal — replaces Alert.alert which renders
          poorly on react-native-web. */}
      <Modal
        visible={dialog != null}
        transparent
        animationType="fade"
        onRequestClose={() => setDialog(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setDialog(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Pressable onPress={() => setDialog(null)} hitSlop={8} style={styles.modalCloseBtn}>
              <X size={18} color={colors.text.muted} />
            </Pressable>

            {dialog?.kind === 'info' && (
              <>
                <Text style={styles.modalTitle}>{dialog.title}</Text>
                <Text style={styles.modalBody}>{dialog.body}</Text>
                <View style={styles.modalActions}>
                  <Pressable
                    onPress={() => setDialog(null)}
                    style={({ pressed }) => [styles.modalBtnPrimary, pressed && { opacity: 0.85 }]}
                  >
                    <Text style={styles.modalBtnPrimaryText}>حسناً</Text>
                  </Pressable>
                </View>
              </>
            )}

            {dialog?.kind === 'confirm-logout' && (
              <>
                <Text style={styles.modalTitle}>تأكيد تسجيل الخروج</Text>
                <Text style={styles.modalBody}>هل تريد فعلاً تسجيل الخروج من حساب المتجر؟</Text>
                <View style={styles.modalActions}>
                  <Pressable
                    onPress={() => setDialog(null)}
                    style={({ pressed }) => [styles.modalBtnGhost, pressed && { opacity: 0.85 }]}
                  >
                    <Text style={styles.modalBtnGhostText}>إلغاء</Text>
                  </Pressable>
                  <Pressable
                    onPress={performLogout}
                    style={({ pressed }) => [styles.modalBtnDanger, pressed && { opacity: 0.85 }]}
                  >
                    <Text style={styles.modalBtnDangerText}>تسجيل خروج</Text>
                  </Pressable>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

interface MenuItemProps {
  Icon: LucideIcon;
  label: string;
  sublabel?: string;
  destructive?: boolean;
  onPress: () => void;
}

function MenuItem({ Icon, label, sublabel, destructive, onPress }: MenuItemProps) {
  const tint = destructive ? colors.dangerLight : colors.brand.redLight;
  const fg = destructive ? colors.danger : colors.brand.red;
  const titleColor = destructive ? colors.danger : colors.ink;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.menuItemIcon, { backgroundColor: tint }]}>
        <Icon size={18} color={fg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.menuItemLabel, { color: titleColor }]}>{label}</Text>
        {sublabel ? <Text style={styles.menuItemSub}>{sublabel}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { paddingVertical: spacing.lg, paddingBottom: spacing.xxl },
  // Identity
  identityCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.md,
  },
  identityHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  identityIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityName: {
    fontFamily: fontFamilies.headingBlack,
    fontSize: fontSizes.lg,
    color: colors.ink,
  },
  identitySubName: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  identityMetaRow: { gap: spacing.xs },
  identityMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  identityMetaText: {
    fontFamily: fontFamilies.body,
    color: colors.text.secondary,
    fontSize: fontSizes.sm,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  ratingValue: {
    fontFamily: fontFamilies.headingBlack,
    color: colors.ink,
    fontSize: fontSizes.md,
  },
  ratingLabel: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.xs,
  },
  // Menu
  sectionLabel: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    letterSpacing: 0.4,
  },
  menuCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  menuItemIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
  },
  menuItemSub: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  menuDivider: { height: 1, backgroundColor: colors.line },
  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.sm,
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 32,
    height: 32,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  modalTitle: {
    fontFamily: fontFamilies.headingBlack,
    fontSize: fontSizes.lg,
    color: colors.ink,
    marginTop: spacing.xs,
  },
  modalBody: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.text.secondary,
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    justifyContent: 'flex-end',
  },
  modalBtnPrimary: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.brand.red,
  },
  modalBtnPrimaryText: {
    fontFamily: fontFamilies.bodyBold,
    color: colors.white,
    fontSize: fontSizes.sm,
  },
  modalBtnGhost: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  modalBtnGhostText: {
    fontFamily: fontFamilies.bodyBold,
    color: colors.text.secondary,
    fontSize: fontSizes.sm,
  },
  modalBtnDanger: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.danger,
  },
  modalBtnDangerText: {
    fontFamily: fontFamilies.bodyBold,
    color: colors.white,
    fontSize: fontSizes.sm,
  },
});
