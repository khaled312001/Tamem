/**
 * CategoriesStrip — horizontal scrollable strip of category circles shown
 * on the Home screen. Tapping a category drills into a category-filtered
 * StoresList; tapping the trailing "see all" tile opens the NearbyMap.
 *
 * Data: GET /categories — { id, name, nameAr, iconUrl, sortOrder }.
 * The endpoint already filters by isActive and orders by sortOrder, so we
 * render the response in whatever order the server gives us.
 *
 * Icons: when the server returns no iconUrl we fall back to a generic
 * lucide grid icon — keeps the strip visually consistent even if the
 * admin hasn't uploaded artwork yet.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { LayoutGrid, MapPin } from 'lucide-react-native';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api } from '../../lib/api';
import { haptic } from '../../lib/haptics';
import type { HomeStackParamList } from '../../navigation/HomeStack';
import { colors, fontFamilies, fontSizes, spacing } from '../../theme/tokens';

import { SectionHeader } from '../ui';

type NavProp = NativeStackNavigationProp<HomeStackParamList, 'Home'>;

interface Category {
  id: string;
  name: string;
  nameAr: string;
  iconUrl?: string | null;
  sortOrder: number;
}

const CIRCLE_SIZE = 64;

export function CategoriesStrip() {
  const navigation = useNavigation<NavProp>();

  const { data: categories, isLoading } = useQuery<Category[]>({
    queryKey: ['home-categories'],
    queryFn: () => api.raw.get('/categories').then((r) => r.data.data),
    staleTime: 5 * 60_000,
  });

  // Hide the whole section while loading the first time — a flash of an
  // empty strip is uglier than a brief gap. We can revisit with a skeleton
  // if categories grow slow to fetch.
  if (isLoading || !categories || categories.length === 0) return null;

  return (
    <View>
      <SectionHeader
        title="التصنيفات"
        actionLabel="عرض الكل"
        onAction={() => {
          haptic.tap();
          navigation.navigate('NearbyMap');
        }}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {categories.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => {
              haptic.tap();
              navigation.navigate('StoresList', { categoryId: c.id });
            }}
            style={({ pressed }) => [styles.item, pressed && { opacity: 0.85 }]}
            accessibilityLabel={c.nameAr}
          >
            <View style={styles.circle}>
              {c.iconUrl ? (
                <Image source={{ uri: c.iconUrl }} style={styles.iconImg} resizeMode="cover" />
              ) : (
                <LayoutGrid size={26} color={colors.brand.red} />
              )}
            </View>
            <Text style={styles.label} numberOfLines={2}>
              {c.nameAr}
            </Text>
          </Pressable>
        ))}

        {/* Trailing tile → NearbyMap, mirrors the "see all" CTA in the
            section header but reachable without scrolling back up. */}
        <Pressable
          onPress={() => {
            haptic.tap();
            navigation.navigate('NearbyMap');
          }}
          style={({ pressed }) => [styles.item, pressed && { opacity: 0.85 }]}
          accessibilityLabel="عرض على الخريطة"
        >
          <View style={[styles.circle, styles.circleMap]}>
            <MapPin size={24} color={colors.brand.gold} />
          </View>
          <Text style={styles.label} numberOfLines={2}>
            على الخريطة
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: spacing.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: 2,
  },
  item: {
    width: CIRCLE_SIZE + 12,
    alignItems: 'center',
    gap: 6,
  },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
  },
  circleMap: {
    backgroundColor: colors.brand.goldLight,
    borderColor: colors.brand.goldLight,
  },
  iconImg: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
  },
  label: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
    textAlign: 'center',
    maxWidth: CIRCLE_SIZE + 12,
  },
});
