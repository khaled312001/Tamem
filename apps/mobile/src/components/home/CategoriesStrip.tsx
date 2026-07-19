/**
 * CategoriesStrip — premium horizontal strip of category tiles.
 *
 * Visual design (post-redesign):
 *   - 76×76 rounded squares with a soft gradient background (red → gold for
 *     odd indices, gold → orange for evens) and a drop shadow.
 *   - Server-supplied iconUrl renders as an inset rounded image; without
 *     one we fall back to a category-specific lucide icon picked by the
 *     Arabic name keyword (مطاعم → UtensilsCrossed, صيدلية → Pill, etc.)
 *     instead of a generic grid icon — feels much closer to Talabat/Yamm.
 *   - Press feedback: subtle scale-down + opacity change.
 *
 * Data: GET /categories — { id, name, nameAr, iconUrl, sortOrder }.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import type { ScrollView as ScrollViewType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Apple,
  Bike,
  Carrot,
  Coffee,
  CookingPot,
  Croissant,
  Drumstick,
  Flower2,
  Gift,
  IceCream,
  LayoutGrid,
  MapPin,
  Newspaper,
  Pill,
  Sandwich,
  ShoppingCart,
  type LucideIcon,
  UtensilsCrossed,
} from 'lucide-react-native';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api } from '../../lib/api';
import { haptic } from '../../lib/haptics';
import type { HomeStackParamList } from '../../navigation/HomeStack';
import { colors, fontFamilies, fontSizes, radii, shadows, spacing } from '../../theme/tokens';

import { SectionHeader } from '../ui';

import { useWebDragScroll } from './useWebDragScroll';

type NavProp = NativeStackNavigationProp<HomeStackParamList, 'Home'>;

interface Category {
  id: string;
  name: string;
  nameAr: string;
  iconUrl?: string | null;
  sortOrder: number;
}

const TILE_SIZE = 72;

/**
 * Picks a lucide icon based on Arabic keywords in the category name so we
 * never render a generic grid when the admin hasn't uploaded artwork yet.
 * Order matters — first match wins.
 */
export function iconFor(nameAr: string): LucideIcon {
  const n = nameAr;
  if (/مطعم|طعام|وجب|أكل/.test(n)) return UtensilsCrossed;
  if (/برجر|سندوتش|ساندو/.test(n)) return Sandwich;
  if (/فراخ|دجاج|بانيه/.test(n)) return Drumstick;
  if (/قهوة|بن|كافيه|قهاوي/.test(n)) return Coffee;
  if (/فطار|كرواسون|مخبوزات|فطائر|حلوي|حلاوة|كنافة/.test(n)) return Croissant;
  if (/أيس|آيس|مثلجات/.test(n)) return IceCream;
  if (/فاكهة|خضار|خضراوات|فواكه|فول|تموين/.test(n)) return Carrot;
  if (/تفاح|فاكهة/.test(n)) return Apple;
  if (/زهور|ورد|بوكيه|هدايا/.test(n)) return Gift;
  if (/زرع|نبات/.test(n)) return Flower2;
  if (/سوبر|ماركت|بقالة|تموين/.test(n)) return ShoppingCart;
  if (/مكتبة|جرايد|مكتبات/.test(n)) return Newspaper;
  if (/صيدلية|دواء|أدوية/.test(n)) return Pill;
  if (/شحن|دليفري|توصيل/.test(n)) return Bike;
  if (/طبخ|طباخ/.test(n)) return CookingPot;
  return LayoutGrid;
}

/**
 * Brand-aligned gradient palette — rotates per tile so the strip has rhythm
 * without becoming chaotic. All gradients keep the red→amber temperature
 * the brand already uses elsewhere (hero, splash, brand strip).
 */
const GRADIENTS: Array<[string, string]> = [
  ['#FF6B5C', '#E0301E'], // brand red glow
  ['#FFB347', '#EC7A2C'], // amber → orange
  ['#FFD86F', '#F2A93B'], // gold pour
  ['#FFA76D', '#E0301E'], // peach → red
  ['#FF8C9A', '#E0301E'], // rose → red
];

export function CategoriesStrip() {
  const navigation = useNavigation<NavProp>();
  const scrollRef = useRef<ScrollViewType>(null);
  useWebDragScroll(scrollRef);

  const { data: categories, isLoading } = useQuery<Category[]>({
    queryKey: ['home-categories'],
    queryFn: () => api.raw.get('/categories').then((r) => r.data.data),
    staleTime: 5 * 60_000,
  });

  if (isLoading || !categories || categories.length === 0) return null;

  return (
    <View style={{ marginTop: spacing.lg }}>
      <SectionHeader
        title="التصنيفات"
        actionLabel="على الخريطة"
        onAction={() => {
          haptic.tap();
          navigation.navigate('NearbyMap');
        }}
      />
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {categories.map((c, idx) => {
          const Icon = iconFor(c.nameAr);
          const grad = GRADIENTS[idx % GRADIENTS.length]!;
          return (
            <Pressable
              key={c.id}
              onPress={() => {
                haptic.tap();
                navigation.navigate('StoresList', { categoryId: c.id });
              }}
              style={({ pressed }) => [styles.item, pressed && { transform: [{ scale: 0.94 }] }]}
              accessibilityLabel={c.nameAr}
            >
              <LinearGradient
                colors={grad}
                start={{ x: 0.1, y: 0.1 }}
                end={{ x: 0.9, y: 0.9 }}
                style={[styles.tile, shadows.sm]}
              >
                {c.iconUrl ? (
                  <Image source={{ uri: c.iconUrl }} style={styles.iconImg} resizeMode="cover" />
                ) : (
                  <Icon size={32} color={colors.white} strokeWidth={2.2} />
                )}
              </LinearGradient>
              <Text style={styles.label} numberOfLines={2}>
                {c.nameAr}
              </Text>
            </Pressable>
          );
        })}

        <Pressable
          onPress={() => {
            haptic.tap();
            navigation.navigate('NearbyMap');
          }}
          style={({ pressed }) => [styles.item, pressed && { transform: [{ scale: 0.94 }] }]}
          accessibilityLabel="عرض على الخريطة"
        >
          <View style={[styles.tile, styles.tileMap, shadows.sm]}>
            <MapPin size={28} color={colors.brand.red} strokeWidth={2.2} />
          </View>
          <Text style={styles.label} numberOfLines={2}>
            الخريطة
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: 2,
  },
  item: {
    width: TILE_SIZE + 8,
    alignItems: 'center',
    gap: 8,
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tileMap: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.brand.red,
  },
  iconImg: {
    width: TILE_SIZE - 16,
    height: TILE_SIZE - 16,
    borderRadius: radii.md,
  },
  label: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
    textAlign: 'center',
    maxWidth: TILE_SIZE + 8,
  },
});
