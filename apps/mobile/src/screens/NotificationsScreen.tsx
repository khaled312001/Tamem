import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react-native';
import { memo, useEffect } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedListItem } from '../components/AnimatedListItem';
import { GradientHeader } from '../components/GradientHeader';
import { CardListSkeleton } from '../components/Skeleton';
import { api } from '../lib/api';
import { connectSocket } from '../lib/socket';
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
      >
        <View style={styles.iconWrap}>
          <Bell size={18} color={colors.brand.red} />
          {!item.isRead && <View style={styles.dot} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{item.titleAr}</Text>
          <Text style={styles.body}>{item.bodyAr}</Text>
          <Text style={styles.time}>{new Date(item.sentAt).toLocaleString('ar-EG')}</Text>
        </View>
      </Pressable>
    </AnimatedListItem>
  );
});

export function NotificationsScreen() {
  const qc = useQueryClient();
  const navigation = useNavigation();

  const { data, isLoading, refetch, isFetching } = useQuery<NotificationRow[]>({
    queryKey: ['notifications'],
    queryFn: () =>
      api.raw.get('/notifications', { params: { pageSize: 30 } }).then((r) => r.data.data),
  });

  // Live update: when admin acts, the backend creates a Notification AND emits a
  // socket event for the order. Listening to order:status is the simplest signal
  // that a new notification has likely arrived.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await connectSocket();
      const refresh = () => {
        if (!cancelled) qc.invalidateQueries({ queryKey: ['notifications'] });
      };
      s.on('order:status', refresh);
      return () => {
        s.off('order:status', refresh);
      };
    })();
    return () => {
      cancelled = true;
    };
  }, [qc]);

  const markRead = useMutation({
    mutationFn: (id: string) => api.raw.patch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => api.raw.patch('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const onPressNotif = (n: NotificationRow) => {
    if (!n.isRead) markRead.mutate(n.id);
    if (n.data?.orderId) {
      // Navigate to the Orders tab's OrderTracking screen
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigation as any).navigate('Orders', {
        screen: 'OrderTracking',
        params: { orderId: n.data.orderId },
      });
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <GradientHeader greeting="الإشعارات" location="تنبيهات طلباتك والعروض" />

      {isLoading ? (
        <View style={styles.list}>
          <CardListSkeleton count={4} />
        </View>
      ) : !data?.length ? (
        <View style={styles.empty}>
          <Bell size={48} color={colors.text.muted} />
          <Text style={styles.emptyTitle}>لا توجد إشعارات بعد</Text>
          <Text style={styles.emptySub}>ستظهر هنا تحديثات طلباتك والعروض الترويجية.</Text>
        </View>
      ) : (
        <>
          {data.some((n) => !n.isRead) && (
            <Pressable onPress={() => markAllRead.mutate()} style={styles.markAll}>
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
    right: 0,
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
  time: { fontFamily: fontFamilies.body, color: colors.text.muted, fontSize: 10, marginTop: 4 },
});
