import { useQuery } from '@tanstack/react-query';
import { Copy, Gift, Sparkles, Tag } from 'lucide-react-native';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/ScreenHeader';
import { AnimatedListItem, CardListSkeleton, EmptyState } from '../components/ui';
import { api } from '../lib/api';
import { showToast } from '../lib/toast';
import { colors, fontFamilies, fontSizes, radii, shadows, spacing } from '../theme/tokens';

interface Coupon {
  id: string;
  code: string;
  type: 'PERCENTAGE' | 'FLAT';
  value: number;
  minOrderAmount?: number | null;
  maxDiscount?: number | null;
  validTo?: string | null;
  description?: string | null;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}

export function CouponsScreen() {
  const { data, isLoading, refetch, isFetching, error } = useQuery<Coupon[]>({
    queryKey: ['available-coupons'],
    queryFn: () => api.raw.get('/coupons/available').then((r) => r.data.data),
  });

  const onCopy = async (code: string) => {
    const ok = await copyText(code);
    showToast({
      title: ok ? 'تم نسخ الكود ✓' : `الكود: ${code}`,
      message: ok ? 'استخدمه عند تأكيد طلبك للحصول على الخصم' : undefined,
      tone: 'success',
    });
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader title="العروض والكوبونات" subtitle="استخدم الكود عند تأكيد الطلب" />

      {isLoading ? (
        <View style={styles.listPad}>
          <CardListSkeleton count={3} />
        </View>
      ) : error ? (
        <EmptyState
          icon={<Gift size={36} color={colors.danger} />}
          title="تعذّر تحميل العروض"
          subtitle={error instanceof Error ? error.message : 'حصلت مشكلة'}
          actionLabel="إعادة المحاولة"
          onAction={() => refetch()}
        />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={[
            styles.listPad,
            (!data || data.length === 0) && { flexGrow: 1, justifyContent: 'center' },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isFetching}
              onRefresh={refetch}
              tintColor={colors.brand.red}
            />
          }
          ListHeaderComponent={
            data && data.length > 0 ? (
              <View style={styles.banner}>
                <Sparkles size={16} color={colors.brand.gold} />
                <Text style={styles.bannerText}>
                  دوس على أي كود لنسخه، وألصقه في حقل الكوبون عند إنشاء الطلب.
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon={<Tag size={36} color={colors.brand.red} />}
              title="مفيش عروض متاحة الآن"
              subtitle="هنبلّغك أول ما عرض جديد يبقى متاح."
            />
          }
          renderItem={({ item, index }) => {
            const isPct = item.type === 'PERCENTAGE';
            const valueLabel = isPct
              ? `${item.value}%`
              : `${item.value.toLocaleString('ar-EG')} ج.م`;
            return (
              <AnimatedListItem index={index}>
                <View style={[styles.card, shadows.sm]}>
                  <View style={styles.cardLeft}>
                    <Text style={styles.cardValue}>{valueLabel}</Text>
                    <Text style={styles.cardValueLabel}>خصم</Text>
                  </View>
                  <View style={styles.notchTop} />
                  <View style={styles.notchBottom} />
                  <View style={styles.cardBody}>
                    <Pressable
                      onPress={() => onCopy(item.code)}
                      style={({ pressed }) => [styles.codeRow, pressed && { opacity: 0.85 }]}
                    >
                      <Text style={styles.code}>{item.code}</Text>
                      <View style={styles.copyBtn}>
                        <Copy size={12} color={colors.brand.red} />
                        <Text style={styles.copyText}>نسخ</Text>
                      </View>
                    </Pressable>
                    {item.description ? (
                      <Text style={styles.cardDesc}>{item.description}</Text>
                    ) : null}
                    <View style={styles.cardMetaRow}>
                      {item.minOrderAmount ? (
                        <Text style={styles.cardMeta}>
                          الحد الأدنى {item.minOrderAmount.toLocaleString('ar-EG')} ج.م
                        </Text>
                      ) : null}
                      {item.maxDiscount && isPct ? (
                        <Text style={styles.cardMeta}>
                          أقصى خصم {item.maxDiscount.toLocaleString('ar-EG')} ج.م
                        </Text>
                      ) : null}
                      {item.validTo ? (
                        <Text style={styles.cardMeta}>
                          ينتهي{' '}
                          {new Date(item.validTo).toLocaleDateString('ar-EG', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              </AnimatedListItem>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const NOTCH = 16;
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  listPad: { padding: spacing.lg, paddingBottom: spacing.xxl },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand.gold + '18',
    borderColor: colors.brand.gold,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
  },
  bannerText: {
    flex: 1,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    color: colors.ink,
    lineHeight: 18,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  cardLeft: {
    backgroundColor: colors.brand.red,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    minWidth: 100,
  },
  cardValue: {
    color: colors.white,
    fontFamily: fontFamilies.headingBlack,
    fontSize: fontSizes.xxl,
  },
  cardValueLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  // The notches that give the coupon a ticket-stub look
  notchTop: {
    position: 'absolute',
    top: -NOTCH / 2,
    left: 96,
    width: NOTCH,
    height: NOTCH,
    backgroundColor: colors.surface,
    borderRadius: NOTCH / 2,
  },
  notchBottom: {
    position: 'absolute',
    bottom: -NOTCH / 2,
    left: 96,
    width: NOTCH,
    height: NOTCH,
    backgroundColor: colors.surface,
    borderRadius: NOTCH / 2,
  },
  cardBody: {
    flex: 1,
    padding: spacing.md,
    gap: 6,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  code: {
    fontFamily: fontFamilies.headingBlack,
    fontSize: fontSizes.lg,
    color: colors.ink,
    letterSpacing: 1,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brand.redLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  copyText: {
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xs,
  },
  cardDesc: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  cardMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: 4,
  },
  cardMeta: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 10,
    color: colors.text.muted,
  },
});
