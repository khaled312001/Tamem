import { useQuery } from '@tanstack/react-query';
import { ArrowDownCircle, ArrowUpCircle, Gift, Wallet as WalletIcon } from 'lucide-react-native';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/ScreenHeader';
import { api } from '../lib/api';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

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
  EARN: { icon: Gift, color: colors.success, label: 'مكافأة', sign: '+' },
  SPEND: { icon: ArrowUpCircle, color: colors.brand.red, label: 'دفع', sign: '-' },
  REFUND: { icon: ArrowDownCircle, color: colors.success, label: 'استرداد', sign: '+' },
  MANUAL_CREDIT: {
    icon: ArrowDownCircle,
    color: colors.success,
    label: 'إيداع',
    sign: '+',
  },
  MANUAL_DEBIT: {
    icon: ArrowUpCircle,
    color: colors.brand.red,
    label: 'خصم',
    sign: '-',
  },
};

export function WalletScreen() {
  const { data, isLoading, refetch, isFetching } = useQuery<WalletResponse>({
    queryKey: ['my-wallet'],
    queryFn: () => api.raw.get('/me/wallet').then((r) => r.data.data),
  });

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader title="محفظتي" />

      {isLoading || !data ? (
        <ActivityIndicator color={colors.brand.red} style={{ marginTop: spacing.xl }} />
      ) : (
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
              <View style={styles.balanceCard}>
                <View style={styles.balanceIconWrap}>
                  <WalletIcon size={26} color={colors.white} />
                </View>
                <Text style={styles.balanceLabel}>الرصيد الحالي</Text>
                <Text style={styles.balanceValue}>
                  {Number(data.wallet.balance).toLocaleString('ar-EG')}
                  <Text style={styles.balanceCurrency}> ج.م</Text>
                </Text>
                <View style={styles.balanceStatsRow}>
                  <View style={styles.balanceStat}>
                    <Text style={styles.balanceStatNum}>
                      {Number(data.wallet.totalEarned).toLocaleString('ar-EG')}
                    </Text>
                    <Text style={styles.balanceStatLabel}>إجمالي مكاسبك</Text>
                  </View>
                  <View style={styles.balanceStatDivider} />
                  <View style={styles.balanceStat}>
                    <Text style={styles.balanceStatNum}>
                      {Number(data.wallet.totalSpent).toLocaleString('ar-EG')}
                    </Text>
                    <Text style={styles.balanceStatLabel}>إجمالي مصروفك</Text>
                  </View>
                </View>
              </View>

              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  💰 احصل على 5% مكافأة على كل طلب تكمله. استخدم رصيدك في طلباتك القادمة.
                </Text>
              </View>

              <Text style={styles.sectionTitle}>سجل الحركات</Text>
            </>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Gift size={40} color={colors.text.muted} />
              <Text style={styles.emptyTitle}>لسه مفيش حركات</Text>
              <Text style={styles.emptySub}>أكمل أول طلب للحصول على مكافأة الولاء</Text>
            </View>
          }
          renderItem={({ item }) => {
            const meta = TX_META[item.type] ?? TX_META.SPEND!;
            return (
              <View style={styles.txCard}>
                <View style={[styles.txIcon, { backgroundColor: meta.color + '20' }]}>
                  <meta.icon size={18} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txLabel}>{meta.label}</Text>
                  {item.reason && <Text style={styles.txReason}>{item.reason}</Text>}
                  <Text style={styles.txDate}>
                    {new Date(item.createdAt).toLocaleString('ar-EG')}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.txAmount, { color: meta.color }]}>
                    {meta.sign}
                    {Number(item.amount).toLocaleString('ar-EG')}
                  </Text>
                  <Text style={styles.txBalance}>
                    رصيد: {Number(item.balanceAfter).toLocaleString('ar-EG')}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  list: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm },
  balanceCard: {
    backgroundColor: colors.brand.red,
    borderRadius: radii.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  balanceIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  balanceLabel: {
    color: colors.white,
    opacity: 0.85,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
  },
  balanceValue: {
    color: colors.white,
    fontFamily: fontFamilies.headingBlack,
    fontSize: 36,
    marginTop: 4,
  },
  balanceCurrency: { fontSize: fontSizes.md },
  balanceStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'stretch',
  },
  balanceStat: { flex: 1, alignItems: 'center' },
  balanceStatNum: {
    color: colors.white,
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.md,
  },
  balanceStatLabel: {
    color: colors.white,
    opacity: 0.7,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  balanceStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  infoBox: {
    backgroundColor: colors.brand.gold + '20',
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.md,
  },
  infoText: {
    color: colors.ink,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    lineHeight: 18,
    textAlign: 'center',
  },
  sectionTitle: {
    fontFamily: fontFamilies.headingBold,
    color: colors.ink,
    fontSize: fontSizes.md,
    marginBottom: spacing.sm,
  },
  empty: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { fontFamily: fontFamilies.bodyExtraBold, color: colors.ink, fontSize: fontSizes.md },
  emptySub: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.sm,
    textAlign: 'center',
  },
  txCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: spacing.xs,
  },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txLabel: { fontFamily: fontFamilies.bodyExtraBold, color: colors.ink, fontSize: fontSizes.sm },
  txReason: {
    fontFamily: fontFamilies.body,
    color: colors.text.secondary,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  txDate: { fontFamily: fontFamilies.body, color: colors.text.muted, fontSize: 10, marginTop: 2 },
  txAmount: { fontFamily: fontFamilies.headingBold, fontSize: fontSizes.md },
  txBalance: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: 10,
    marginTop: 2,
  },
});
