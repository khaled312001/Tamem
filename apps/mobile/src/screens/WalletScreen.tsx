import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  Gift,
  Wallet as WalletIcon,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/ScreenHeader';
import { ForwardChevron } from '../theme/rtl';
import { CardListSkeleton, EmptyState } from '../components/ui';
import { api } from '../lib/api';
import {
  colors,
  fontFamilies,
  fontSizes,
  gradients,
  radii,
  shadows,
  spacing,
} from '../theme/tokens';

interface WalletResponse {
  wallet: {
    id: string;
    balance: string | number;
    totalEarned: string | number;
    totalSpent: string | number;
  };
  transactions: Array<{
    id: string;
    type: string;
    amount: string | number;
    balanceAfter: string | number;
    reason?: string | null;
    createdAt: string;
    orderId?: string | null;
  }>;
}

const TX_META: Record<
  string,
  { icon: typeof Gift; color: string; label: string; sign: '+' | '-' }
> = {
  EARN: { icon: Gift, color: colors.success, label: 'مكافأة ولاء', sign: '+' },
  SPEND: { icon: ArrowUpCircle, color: colors.brand.red, label: 'دفع طلب', sign: '-' },
  REFUND: { icon: ArrowDownCircle, color: colors.success, label: 'استرداد', sign: '+' },
  MANUAL_CREDIT: { icon: ArrowDownCircle, color: colors.success, label: 'إيداع', sign: '+' },
  MANUAL_DEBIT: { icon: ArrowUpCircle, color: colors.brand.red, label: 'خصم', sign: '-' },
};

export function WalletScreen() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navigation = useNavigation<any>();
  const { data, isLoading, error, refetch, isFetching } = useQuery<WalletResponse>({
    queryKey: ['my-wallet'],
    queryFn: () => api.raw.get('/me/wallet').then((r) => r.data.data),
  });

  if (isLoading) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScreenHeader title="محفظة المكافآت" />
        <View style={styles.skelPad}>
          <View style={styles.skelBalance} />
          <CardListSkeleton count={4} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScreenHeader title="محفظة المكافآت" />
        <EmptyState
          icon={<AlertCircle size={36} color={colors.danger} />}
          title="تعذّر تحميل المحفظة"
          subtitle={error instanceof Error ? error.message : 'حصلت مشكلة أثناء تحميل البيانات'}
          actionLabel="إعادة المحاولة"
          onAction={() => refetch()}
        />
      </SafeAreaView>
    );
  }

  const balance = Number(data.wallet.balance ?? 0);
  const totalEarned = Number(data.wallet.totalEarned ?? 0);
  const totalSpent = Number(data.wallet.totalSpent ?? 0);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader title="محفظة المكافآت" subtitle="نقاط ولائك تُستخدم في طلباتك القادمة" />

      <FlatList
        data={data.transactions}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={refetch}
            tintColor={colors.brand.red}
          />
        }
        ListHeaderComponent={
          <>
            {/* ─────── Balance hero ─────── */}
            <LinearGradient
              colors={gradients.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.balanceCard, shadows.brand]}
            >
              <View style={styles.balanceIconWrap}>
                <WalletIcon size={24} color={colors.white} />
              </View>
              <Text style={styles.balanceLabel}>الرصيد الحالي</Text>
              <View style={styles.balanceValueRow}>
                <Text style={styles.balanceValue}>{balance.toLocaleString('ar-EG')}</Text>
                <Text style={styles.balanceCurrency}>ج.م</Text>
              </View>
              <View style={styles.balanceStatsRow}>
                <View style={styles.balanceStat}>
                  <Text style={styles.balanceStatNum}>{totalEarned.toLocaleString('ar-EG')}</Text>
                  <Text style={styles.balanceStatLabel}>إجمالي المكاسب</Text>
                </View>
                <View style={styles.balanceStatDivider} />
                <View style={styles.balanceStat}>
                  <Text style={styles.balanceStatNum}>{totalSpent.toLocaleString('ar-EG')}</Text>
                  <Text style={styles.balanceStatLabel}>إجمالي المصروف</Text>
                </View>
              </View>
            </LinearGradient>

            {/* ─────── Loyalty info banner ─────── */}
            <View style={styles.infoBox}>
              <Gift size={16} color={colors.brand.gold} />
              <Text style={styles.infoText}>
                احصل على 5% مكافأة ولاء على كل طلب تكمله. الرصيد ده نقاط ولاء بتقدر تستخدمها في
                طلباتك القادمة فقط — مش قابل للسحب نقدي.
              </Text>
            </View>

            <Text style={styles.sectionTitle}>سجل الحركات</Text>
          </>
        }
        ListEmptyComponent={
          <EmptyState
            icon={<WalletIcon size={36} color={colors.brand.red} />}
            title="مفيش حركات لسه"
            subtitle="أكمل أول طلب علشان تبدأ تجمع نقاط المكافأة في محفظتك."
          />
        }
        renderItem={({ item }) => {
          const meta = TX_META[item.type] ?? TX_META.SPEND!;
          const openOrder = item.orderId
            ? () =>
                navigation.getParent()?.navigate('Orders', {
                  screen: 'OrderTracking',
                  params: { orderId: item.orderId },
                })
            : undefined;
          return (
            <Pressable
              onPress={openOrder}
              disabled={!openOrder}
              style={({ pressed }) => [
                styles.txCard,
                shadows.sm,
                pressed && openOrder && { opacity: 0.92 },
              ]}
            >
              <View style={[styles.txIcon, { backgroundColor: meta.color + '18' }]}>
                <meta.icon size={20} color={meta.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.txLabel}>{meta.label}</Text>
                {item.reason ? (
                  <Text style={styles.txReason} numberOfLines={1}>
                    {item.reason}
                  </Text>
                ) : null}
                <Text style={styles.txDate}>
                  {new Date(item.createdAt).toLocaleString('ar-EG', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
              <View style={styles.txAmountWrap}>
                <Text style={[styles.txAmount, { color: meta.color }]}>
                  {meta.sign}
                  {Number(item.amount).toLocaleString('ar-EG')}
                </Text>
                <Text style={styles.txBalance}>
                  رصيد: {Number(item.balanceAfter).toLocaleString('ar-EG')}
                </Text>
              </View>
              {openOrder ? <ForwardChevron size={14} color={colors.text.muted} /> : null}
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  skelPad: { padding: spacing.lg, gap: spacing.md },
  skelBalance: {
    height: 180,
    backgroundColor: colors.line,
    borderRadius: radii.xl,
    marginBottom: spacing.md,
    opacity: 0.7,
  },
  // Balance hero
  balanceCard: {
    borderRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  balanceIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.88)',
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
  },
  balanceValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 6,
  },
  balanceValue: {
    color: colors.white,
    fontFamily: fontFamilies.headingBlack,
    fontSize: 42,
  },
  balanceCurrency: {
    color: colors.white,
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.md,
  },
  balanceStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'stretch',
  },
  balanceStat: { flex: 1, alignItems: 'center', gap: 2 },
  balanceStatNum: {
    color: colors.white,
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.md,
  },
  balanceStatLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
  },
  balanceStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  // Info banner
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand.gold + '18',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.brand.gold + '40',
  },
  infoText: {
    flex: 1,
    color: colors.ink,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    lineHeight: 20,
  },
  sectionTitle: {
    fontFamily: fontFamilies.headingBold,
    color: colors.ink,
    fontSize: fontSizes.md,
    marginBottom: spacing.sm,
  },
  // Transaction row
  txCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: spacing.sm,
  },
  txIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txLabel: {
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
    fontSize: fontSizes.sm,
  },
  txReason: {
    fontFamily: fontFamilies.body,
    color: colors.text.secondary,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  txDate: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: 10,
    marginTop: 4,
  },
  txAmountWrap: { alignItems: 'flex-end', gap: 2 },
  txAmount: {
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.md,
  },
  txBalance: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: 10,
  },
});
