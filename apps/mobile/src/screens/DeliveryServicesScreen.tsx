import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, ShoppingBag, Star } from 'lucide-react-native';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Service } from '@tamem/types';

import { GradientHeader } from '../components/GradientHeader';
import { api } from '../lib/api';
import type { HomeStackParamList } from '../navigation/HomeStack';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'DeliveryServices'>;

/**
 * Lists every active service of category=DELIVERY so the customer can pick
 * (e.g. supermarket / pharmacy / restaurant / laundry / etc).
 * Each card → opens DynamicServiceFlow with the chosen serviceId.
 */
export function DeliveryServicesScreen() {
  const navigation = useNavigation<Nav>();

  const { data, isLoading } = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: () => api.raw.get('/services').then((r) => r.data.data),
  });

  const deliveryServices = (data ?? []).filter((s) => s.category === 'DELIVERY');

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <GradientHeader greeting="خدمات الدليفري" location="داخل المدينة" />

      {isLoading ? (
        <ActivityIndicator color={colors.brand.red} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={deliveryServices}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>لا توجد خدمات دليفري متاحة حالياً</Text>}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate('DynamicServiceFlow', { serviceId: item.id })}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
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
                  <Star size={11} color={colors.brand.gold} fill={colors.brand.gold} />
                  <Text style={styles.metaText}>
                    {item.pricingMethod === 'FIXED'
                      ? `سعر ثابت ${Number(item.basePrice ?? 0)} ج.م`
                      : item.pricingMethod === 'QUOTE'
                        ? 'تسعير حسب الطلب'
                        : 'تسعير حسب المسافة'}
                  </Text>
                </View>
              </View>
              <ChevronLeft size={18} color={colors.text.muted} />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  list: { padding: spacing.lg, paddingBottom: spacing.xl },
  empty: {
    textAlign: 'center',
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    marginTop: spacing.xxl,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  pressed: { opacity: 0.85 },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    backgroundColor: colors.soft,
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
