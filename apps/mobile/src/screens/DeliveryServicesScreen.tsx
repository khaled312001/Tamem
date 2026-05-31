import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { ShoppingBag, Tag } from 'lucide-react-native';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Service } from '@tamem/types';

import { ScreenHeader } from '../components/ScreenHeader';
import { AnimatedListItem, CardListSkeleton, EmptyState, ForwardChevron } from '../components/ui';
import { api } from '../lib/api';
import type { HomeStackParamList } from '../navigation/HomeStack';
import { colors, fontFamilies, fontSizes, radii, shadows, spacing } from '../theme/tokens';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'DeliveryServices'>;

function pricingLabel(s: Service): string {
  if (s.pricingMethod === 'FIXED') return `سعر ثابت ${Number(s.basePrice ?? 0)} ج.م`;
  if (s.pricingMethod === 'QUOTE') return 'تسعير حسب الطلب';
  return 'تسعير حسب المسافة';
}

export function DeliveryServicesScreen() {
  const navigation = useNavigation<Nav>();

  const { data, isLoading } = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: () => api.raw.get('/services').then((r) => r.data.data),
  });

  const deliveryServices = (data ?? []).filter((s) => s.category === 'DELIVERY');

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader title="خدمات الدليفري" subtitle="اختر الخدمة المناسبة لطلبك" />

      {isLoading ? (
        <View style={styles.list}>
          <CardListSkeleton count={4} />
        </View>
      ) : (
        <FlatList
          data={deliveryServices}
          keyExtractor={(s) => s.id}
          contentContainerStyle={[
            styles.list,
            deliveryServices.length === 0 && { flexGrow: 1, justifyContent: 'center' },
          ]}
          ListEmptyComponent={
            <EmptyState
              icon={<ShoppingBag size={36} color={colors.brand.red} />}
              title="لا توجد خدمات متاحة حالياً"
              subtitle="جرّب لاحقاً أو تواصل مع الدعم لو محتاج طلب خاص."
            />
          }
          renderItem={({ item, index }) => (
            <AnimatedListItem index={index}>
              <Pressable
                onPress={() => navigation.navigate('DynamicServiceFlow', { serviceId: item.id })}
                style={({ pressed }) => [styles.card, shadows.sm, pressed && { opacity: 0.92 }]}
              >
                <View style={styles.iconWrap}>
                  {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={styles.iconImg} />
                  ) : (
                    <ShoppingBag size={26} color={colors.brand.red} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{item.nameAr}</Text>
                  <View style={styles.metaRow}>
                    <Tag size={11} color={colors.brand.gold} />
                    <Text style={styles.metaText}>{pricingLabel(item)}</Text>
                  </View>
                </View>
                <ForwardChevron size={18} color={colors.text.muted} />
              </Pressable>
            </AnimatedListItem>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconImg: { width: '100%', height: '100%' },
  title: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  metaText: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
  },
});
