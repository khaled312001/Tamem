import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, Pause, Play, Repeat, Trash2 } from 'lucide-react-native';
import { Alert, FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/ScreenHeader';
import { Badge, CardListSkeleton, EmptyState } from '../components/ui';
import { api } from '../lib/api';
import { LIST_PERF } from '../lib/listPerf';
import { haptic } from '../lib/haptics';
import { showToast } from '../lib/toast';
import { colors, fontFamilies, fontSizes, palette, radii, shadows, spacing } from '../theme/tokens';

type Frequency = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

interface RecurringOrder {
  id: string;
  label?: string | null;
  category: 'DELIVERY' | 'SHIPPING' | 'MERCHANT';
  frequency: Frequency;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  hour: number;
  isActive: boolean;
  lastGeneratedAt?: string | null;
  nextRunAt: string;
  endsAt?: string | null;
  service?: { id: string; nameAr: string; key: string };
}

const FREQ_LABEL: Record<Frequency, string> = {
  DAILY: 'يومياً',
  WEEKLY: 'أسبوعياً',
  BIWEEKLY: 'كل أسبوعين',
  MONTHLY: 'شهرياً',
};

const DAY_LABEL = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function formatCadence(r: RecurringOrder): string {
  const time = `${r.hour}:00`;
  switch (r.frequency) {
    case 'DAILY':
      return `كل يوم الساعة ${time}`;
    case 'WEEKLY':
      return `كل يوم ${DAY_LABEL[r.dayOfWeek ?? 0]} الساعة ${time}`;
    case 'BIWEEKLY':
      return `كل أسبوعين، يوم ${DAY_LABEL[r.dayOfWeek ?? 0]} الساعة ${time}`;
    case 'MONTHLY':
      return `يوم ${r.dayOfMonth ?? 1} من كل شهر الساعة ${time}`;
  }
}

export function RecurringOrdersScreen() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navigation = useNavigation<any>();
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery<RecurringOrder[]>({
    queryKey: ['recurring-orders'],
    queryFn: () => api.raw.get('/me/recurring-orders').then((r) => r.data.data),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.raw.patch(`/me/recurring-orders/${id}`, { isActive }).then((r) => r.data.data),
    onMutate: async ({ id, isActive }) => {
      await qc.cancelQueries({ queryKey: ['recurring-orders'] });
      const prev = qc.getQueryData<RecurringOrder[]>(['recurring-orders']);
      qc.setQueryData<RecurringOrder[]>(['recurring-orders'], (old) =>
        (old ?? []).map((r) => (r.id === id ? { ...r, isActive } : r)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['recurring-orders'], ctx.prev);
      showToast({ title: 'تعذّر التحديث', tone: 'error' });
    },
    onSuccess: (_d, vars) => {
      haptic.success();
      showToast({
        title: vars.isActive ? 'تم استئناف التكرار' : 'تم إيقاف التكرار',
        tone: 'success',
      });
    },
  });

  const deleteOne = useMutation({
    mutationFn: (id: string) =>
      api.raw.delete(`/me/recurring-orders/${id}`).then((r) => r.data.data),
    onSuccess: () => {
      haptic.success();
      showToast({ title: 'تم حذف التكرار', tone: 'success' });
      void refetch();
    },
    onError: () => showToast({ title: 'تعذّر الحذف', tone: 'error' }),
  });

  const onConfirmDelete = (item: RecurringOrder) => {
    Alert.alert(
      'حذف التكرار',
      `${item.label ?? item.service?.nameAr ?? 'الطلب المتكرر'}: مش هيتم إنشاء طلبات جديدة بعد كده.`,
      [
        { text: 'تراجع', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: () => deleteOne.mutate(item.id),
        },
      ],
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader title="الطلبات المتكررة" subtitle="إدارة الطلبات اللي بتنشأ تلقائياً كل فترة" />

      {isLoading ? (
        <View style={styles.pad}>
          <CardListSkeleton count={3} />
        </View>
      ) : (
        <FlatList
          {...LIST_PERF}
          data={data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.pad,
            (data ?? []).length === 0 && { flexGrow: 1, justifyContent: 'center' },
          ]}
          ListHeaderComponent={
            (data ?? []).length > 0 ? (
              <View style={styles.intro}>
                <Repeat size={16} color={palette.gold[600]} />
                <Text style={styles.introText}>
                  بنبدأ المراجعة لطلبك المتكرر تلقائياً في الميعاد. تقدر توقف أو تستأنف في أي وقت.
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon={<Repeat size={36} color={colors.brand.red} />}
              title="مفيش طلبات متكررة"
              subtitle="حوّل طلب عادي لتكرار من شاشة تأكيد الطلب — مفيد للمياه والأدوية والمشاوير اليومية."
              actionLabel="ابدأ طلب جديد"
              onAction={() =>
                navigation.getParent()?.navigate('HomeTab', { screen: 'DeliveryServices' })
              }
            />
          }
          renderItem={({ item }) => (
            <View style={[styles.card, shadows.sm, !item.isActive && { opacity: 0.62 }]}>
              <View style={styles.cardHead}>
                <View style={styles.cardIcon}>
                  <Repeat size={18} color={palette.red[600]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.label ?? item.service?.nameAr ?? 'طلب متكرر'}
                  </Text>
                  <Text style={styles.cardSub} numberOfLines={1}>
                    {item.service?.nameAr ?? item.category}
                  </Text>
                </View>
                <Badge tone={item.isActive ? 'success' : 'neutral'} size="sm">
                  {item.isActive ? 'مفعّل' : 'موقوف'}
                </Badge>
              </View>

              <View style={styles.cadenceRow}>
                <Calendar size={14} color={colors.text.muted} />
                <Text style={styles.cadenceText}>{formatCadence(item)}</Text>
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>التكرار:</Text>
                <Text style={styles.metaValue}>{FREQ_LABEL[item.frequency]}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>الطلب القادم:</Text>
                <Text style={styles.metaValue}>
                  {new Date(item.nextRunAt).toLocaleString('ar-EG', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
              {item.lastGeneratedAt && (
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>آخر تكرار:</Text>
                  <Text style={styles.metaValue}>
                    {new Date(item.lastGeneratedAt).toLocaleDateString('ar-EG')}
                  </Text>
                </View>
              )}

              <View style={styles.actionsRow}>
                <View style={styles.toggleWrap}>
                  {item.isActive ? (
                    <Pause size={16} color={colors.text.secondary} />
                  ) : (
                    <Play size={16} color={palette.green[600]} />
                  )}
                  <Text style={styles.toggleLabel}>{item.isActive ? 'إيقاف مؤقت' : 'استئناف'}</Text>
                  <Switch
                    value={item.isActive}
                    onValueChange={(v) => {
                      haptic.tap();
                      toggleActive.mutate({ id: item.id, isActive: v });
                    }}
                    trackColor={{ false: colors.line2, true: palette.green[400] }}
                    thumbColor={colors.white}
                  />
                </View>

                <Pressable
                  onPress={() => onConfirmDelete(item)}
                  style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.7 }]}
                  accessibilityLabel="حذف"
                >
                  <Trash2 size={16} color={palette.red_danger[600]} />
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  pad: { padding: spacing.lg, paddingBottom: spacing.xxl },
  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.gold[50],
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  introText: {
    flex: 1,
    color: '#6E3209',
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    lineHeight: 18,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  cardIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: palette.red[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
    fontSize: fontSizes.sm,
  },
  cardSub: {
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  cadenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.soft,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    marginBottom: spacing.sm,
  },
  cadenceText: {
    color: colors.ink,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  metaLabel: {
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
  },
  metaValue: {
    color: colors.ink,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  toggleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toggleLabel: {
    flex: 1,
    color: colors.ink,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: palette.red_danger[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
