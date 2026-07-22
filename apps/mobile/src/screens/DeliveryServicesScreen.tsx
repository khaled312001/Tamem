import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { ShoppingBag } from 'lucide-react-native';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { iconFor } from '../components/home/CategoriesStrip';
import { ScreenHeader } from '../components/ScreenHeader';
import { CardListSkeleton, EmptyState } from '../components/ui';
import { api } from '../lib/api';
import type { HomeStackParamList } from '../navigation/HomeStack';
import { colors, fontFamilies, fontSizes, radii, shadows, spacing } from '../theme/tokens';
import type { HomeCategory } from './home/homeData';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'DeliveryServices'>;

// Delivery entry point: instead of one generic «دليفري» service, show every
// store category (مطاعم / صيدليات / سوبر ماركت / خضار وفاكهة …). Tapping a
// category opens the merchant list filtered to it, reusing StoresList.
export function DeliveryServicesScreen() {
  const navigation = useNavigation<Nav>();

  const { data, isLoading } = useQuery<HomeCategory[]>({
    queryKey: ['home-categories'],
    queryFn: () => api.raw.get('/categories').then((r) => r.data.data),
    staleTime: 10 * 60_000,
  });

  const categories = (data ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader title="دليفري داخل المدينة" subtitle="اختر القسم اللي عايز تطلب منه" />

      {isLoading ? (
        <View style={styles.list}>
          <CardListSkeleton count={6} />
        </View>
      ) : (
        <FlatList
          data={categories}
          numColumns={3}
          keyExtractor={(c) => c.id}
          columnWrapperStyle={styles.rowWrap}
          contentContainerStyle={[
            styles.list,
            categories.length === 0 && { flexGrow: 1, justifyContent: 'center' },
          ]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon={<ShoppingBag size={36} color={colors.brand.red} />}
              title="لا توجد أقسام متاحة حالياً"
              subtitle="جرّب لاحقاً أو تواصل مع الدعم."
            />
          }
          renderItem={({ item }) => {
            const Icon = iconFor(item.nameAr);
            return (
              <Pressable
                onPress={() => navigation.navigate('StoresList', { categoryId: item.id })}
                style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}
                accessibilityRole="button"
                accessibilityLabel={item.nameAr}
              >
                <View style={[styles.iconWrap, shadows.sm]}>
                  {item.iconUrl ? (
                    <Image
                      source={{ uri: item.iconUrl }}
                      style={styles.iconImg}
                      resizeMode="cover"
                    />
                  ) : (
                    <Icon size={30} color="#EC7A2C" strokeWidth={1.7} />
                  )}
                </View>
                <Text style={styles.label} numberOfLines={1}>
                  {item.nameAr}
                </Text>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  rowWrap: { justifyContent: 'space-between', marginBottom: spacing.lg },
  tile: { width: '31%', alignItems: 'center' },
  iconWrap: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radii.lg,
    backgroundColor: '#FFF3E6',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  iconImg: { width: '100%', height: '100%' },
  label: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.brand.dark,
    textAlign: 'center',
  },
});
