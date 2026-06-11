import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Bell, CheckCheck } from 'lucide-react-native';
import { memo, useEffect } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedListItem } from '../components/AnimatedListItem';
import { GradientHeader } from '../components/GradientHeader';
import { CardListSkeleton } from '../components/Skeleton';
import { EmptyState } from '../components/ui';
import { api } from '../lib/api';
import { formatRelative } from '../lib/eta';
import { clearAppBadge } from '../lib/push';
import { connectSocket } from '../lib/socket';
import { showToast } from '../lib/toast';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

interface NotificationRow {
  id: string;
  type: string;
  titleAr: string;
  bodyAr: string;
  isRead: boolean;
  sentAt: string;
  data?: { orderId?: string; orderNumber?: string } | null;
}

interface NotifCardProps {
  item: NotificationRow;
  index: number;
  onPress: (n: NotificationRow) => void;
}

const NotifCard = memo(function NotifCard({ item, index, onPress }: NotifCardProps) {
  return (
    <AnimatedListItem index={index}>
      <Pressable
        onPress={() => onPress(item)}
        style={({ pressed }) => [
          styles.card,
          !item.isRead && styles.unread,
          pressed && styles.pressed,
        ]}
        accessibilityLabel={`${item.titleAr}. ${item.bodyAr}. ${formatRelative(item.sentAt)}`}
      >
        <View style={styles.iconWrap}>
          <Bell size={18} color={colors.brand.red} />
          {!item.isRead && <View style={styles.dot} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{item.titleAr}</Text>
          <Text style={styles.body}>{item.bodyAr}</Text>
          <Text style={styles.time}>{formatRelative(item.sentAt)}</Text>
        </View>
      </Pressable>
    </AnimatedListItem>
  );
});

export function NotificationsScreen() {
  const qc = useQueryClient();
  const navigation = useNavigation();

  const { data, isLoading, isError, refetch, isFetching, error } = useQuery<NotificationRow[]>({
    queryKey: ['notifications'],
    queryFn: () =>
      api.raw.get('/notifications', { params: { pageSize: 30 } }).then((r) => r.data.data),
  });

  // Live updates — listener attached to the singleton socket. Cleanup uses
  // the outer useEffect's return so we never leak a listener on unmount
  // (the previous nested IIFE return was unreachable).
  useEffect(() => {
    let cancelled = false;
    let socketRef: Awaited<ReturnType<typeof connectSocket>> | null = null;
    const refresh = () => {
      if (!cancelled) {
        void qc.invalidateQueries({ queryKey: ['notifications'] });
        void qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
      }
    };
    void (async () => {
      socketRef = await connectSocket();
      if (!cancelled) {
        socketRef.on('order:status', refresh);
        socketRef.on('order:new', refresh);
        socketRef.on('notification:new', refresh);
      }
    })();
    // Clear the OS badge as soon as the user looks at the list.
    void clearAppBadge();
    return () => {
      cancelled = true;
      if (socketRef) {
        socketRef.off('order:status', refresh);
        socketRef.off('order:new', refresh);
        socketRef.off('notification:new', refresh);
      }
    };
  }, [qc]);

  const markRead = useMutation({
    mutationFn: (id: string) => api.raw.patch(`/notifications/${id}/read`),
    // Optimistic — flip isRead locally so the unread strip disappears
    // immediately; revert on error.
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ['notifications'] });
      const prev = qc.getQueryData<NotificationRow[]>(['notifications']);
      if (prev) {
        qc.setQueryData<NotificationRow[]>(
          ['notifications'],
          prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
        );
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['notifications'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => api.raw.patch('/notifications/read-all'),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['notifications'] });
      const prev = qc.getQueryData<NotificationRow[]>(['notifications']);
      if (prev) {
        qc.setQueryData<NotificationRow[]>(
          ['notifications'],
          prev.map((n) => ({ ...n, isRead: true })),
        );
      }
      return { prev };
    },
    onSuccess: () => showToast({ title: 'تم تعليم الكل كمقروء', tone: 'success' }),
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['notifications'], ctx.prev);
      showToast({
        title: 'تعذّر تعليم الإشعارات',
        message: e instanceof Error ? e.message : undefined,
        tone: 'error',
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const onPressNotif = (n: NotificationRow) => {
    if (!n.isRead) markRead.mutate(n.id);
    if (n.data?.orderId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigation as any).navigate('Orders', {
        screen: 'OrderTracking',
        params: { orderId: n.data.orderId },
      });
      return;
    }
    if (n.type === 'PROMO' || n.type === 'promo') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigation as any).navigate('ProfileTab', { screen: 'Coupons' });
      return;
    }
    // Generic system notification — show the full body as a toast so the
    // user can at least read it without an upgrade path.
    showToast({ title: n.titleAr, message: n.bodyAr, tone: 'info' });
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <GradientHeader greeting="الإشعارات" location="تنبيهات طلباتك والعروض" hideBack />

      {isLoading ? (
        <View style={styles.list}>
          <CardListSkeleton count={4} />
        </View>
      ) : isError ? (
        <EmptyState
          icon={<AlertCircle size={36} color={colors.danger} />}
          title="تعذّر تحميل الإشعارات"
          subtitle={error instanceof Error ? error.message : 'تأكد من اتصالك بالإنترنت'}
          actionLabel="إعادة المحاولة"
          onAction={() => refetch()}
        />
      ) : !data?.length ? (
        <View style={styles.empty}>
          <Bell size={48} color={colors.text.muted} />
          <Text style={styles.emptyTitle}>لا توجد إشعارات بعد</Text>
          <Text style={styles.emptySub}>ستظهر هنا تحديثات طلباتك والعروض الترويجية.</Text>
        </View>
      ) : (
        <>
          {data.some((n) => !n.isRead) && (
            <Pressable
              onPress={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              style={({ pressed }) => [
                styles.markAll,
                (pressed || markAllRead.isPending) && { opacity: 0.7 },
              ]}
            >
              <CheckCheck size={14} color={colors.brand.red} />
              <Text style={styles.markAllText}>تعليم الكل كمقروء</Text>
            </Pressable>
          )}
          <FlatList
            data={data}
            keyExtractor={(n) => n.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={7}
            removeClippedSubviews
            renderItem={({ item, index }) => (
              <NotifCard item={item} index={index} onPress={onPressNotif} />
            )}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  list: { padding: spacing.lg, gap: spacing.sm },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  emptyTitle: { fontSize: fontSizes.md, fontFamily: fontFamilies.bodyExtraBold, color: colors.ink },
  emptySub: {
    fontSize: fontSizes.sm,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  markAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  markAllText: {
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
  },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: spacing.sm,
  },
  unread: { borderColor: colors.brand.red + '40', backgroundColor: colors.brand.red + '08' },
  pressed: { opacity: 0.85 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 0,
    end: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand.red,
  },
  title: { fontFamily: fontFamilies.bodyExtraBold, color: colors.ink, fontSize: fontSizes.sm },
  body: {
    fontFamily: fontFamilies.body,
    color: colors.text.secondary,
    fontSize: fontSizes.xs,
    marginTop: 2,
    lineHeight: 20,
  },
  time: { fontFamily: fontFamilies.body, color: colors.text.muted, fontSize: 12, marginTop: 4 },
});
