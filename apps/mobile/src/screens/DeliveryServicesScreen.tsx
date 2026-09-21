import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { ShoppingBag } from 'lucide-react-native';
import { useMemo, useState } from 'react';
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
//
// A city chooser (قفط / قنا) sits on top: pick a city first and the category
// opens already filtered to it, so the customer knows which town they are
// ordering from before they even see a store. The cities come from the same
// home-config the home rails use, so opening a third city is a dashboard edit.
export function DeliveryServicesScreen() {
  const navigation = useNavigation<Nav>();

  const { data, isLoading } = useQuery<HomeCategory[]>({
    queryKey: ['home-categories'],
    queryFn: () => api.raw.get('/categories').then((r) => r.data.data),
    staleTime: 10 * 60_000,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cfg } = useQuery<any>({
    queryKey: ['home-config'],
    queryFn: () => api.raw.get('/home-config').then((r) => r.data.data),
    staleTime: 10 * 60_000,
  });

  const cities = useMemo(
    () =>
      [cfg?.spotlightCity, cfg?.intercityCity]
        .map((c) => (typeof c === 'string' ? c.trim() : ''))
        .filter((c, i, arr) => c && arr.indexOf(c) === i),
    [cfg],
  );

  const [city, setCity] = useState<string | null>(null);

  const categories = (data ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader title="دليفري داخل المدينة" subtitle="اختر المدينة والقسم اللي عايز تطلب منه" />

      {cities.length > 0 && (
        <View style={styles.cityBar}>
          <Text style={styles.cityHint}>المدينة</Text>
          <View style={styles.cityChips}>
            <Pressable
              onPress={() => setCity(null)}
              style={[styles.cityChip, !city && styles.cityChipOn]}
            >
              <Text style={[styles.cityChipText, !city && styles.cityChipTextOn]}>الكل</Text>
            </Pressable>
            {cities.map((c) => {
              const on = city === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => setCity(on ? null : c)}
                  style={[styles.cityChip, on && styles.cityChipOn]}
                >
                  <Text style={[styles.cityChipText, on && styles.cityChipTextOn]}>{c}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

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
                onPress={() =>
                  navigation.navigate('StoresList', {
                    categoryId: item.id,
                    city: city ?? undefined,
                  })
                }
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
  cityBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  cityHint: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.text.muted,
  },
  cityChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, flex: 1 },
  cityChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cityChipOn: { borderColor: colors.brand.red, backgroundColor: '#FDECEA' },
  cityChipText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.brand.dark,
  },
  cityChipTextOn: { color: colors.brand.red },
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
