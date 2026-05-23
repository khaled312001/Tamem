import { useQuery } from '@tanstack/react-query';
import { Search, Star, Store } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientHeader } from '../components/GradientHeader';
import { api } from '../lib/api';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

interface Merchant {
  id: string;
  storeNameAr: string;
  addressLine: string;
  rating?: number | null;
  isOpen: boolean;
  category?: { id: string; nameAr: string };
}

const FILTERS = [
  { key: 'all', label: 'الكل', categoryId: null },
  { key: 'restaurants', label: 'مطاعم', categoryId: 'restaurants' },
  { key: 'supermarkets', label: 'ماركت', categoryId: 'supermarkets' },
  { key: 'pharmacies', label: 'صيدليات', categoryId: 'pharmacies' },
  { key: 'sweets', label: 'حلويات', categoryId: 'sweets' },
];

export function StoresListScreen() {
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const { data: merchants, isLoading } = useQuery<Merchant[]>({
    queryKey: ['merchants', activeFilter, search],
    queryFn: () => {
      const filter = FILTERS.find((f) => f.key === activeFilter);
      const params: Record<string, string> = {};
      if (filter?.categoryId) params.categoryId = filter.categoryId;
      if (search) params.search = search;
      return api.raw.get('/merchants', { params }).then((r) => r.data.data);
    },
  });

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <GradientHeader greeting="المحلات والمطاعم" location="قفط — قنا" />

      <View style={styles.searchWrap}>
        <Search size={16} color={colors.text.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="ابحث عن محل…"
          placeholderTextColor={colors.text.muted}
          style={styles.searchInput}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {FILTERS.map((f) => {
          const isOn = activeFilter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setActiveFilter(f.key)}
              style={[styles.chip, isOn && styles.chipOn]}
            >
              <Text style={[styles.chipText, isOn && styles.chipTextOn]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <ActivityIndicator color={colors.brand.red} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={merchants ?? []}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.empty}>لا توجد محلات بهذا الفلتر</Text>}
          renderItem={({ item }) => (
            <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
              <View style={styles.cardIcon}>
                <Store size={22} color={colors.brand.red} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.storeNameAr}</Text>
                <View style={styles.cardMeta}>
                  <Star size={11} color={colors.brand.gold} fill={colors.brand.gold} />
                  <Text style={styles.cardSub}>
                    {Number(item.rating ?? 0).toFixed(1)} · {item.category?.nameAr ?? '—'}
                  </Text>
                </View>
                <Text style={styles.cardAddress}>{item.addressLine}</Text>
              </View>
              <View style={item.isOpen ? styles.tagOpen : styles.tagClosed}>
                <Text style={item.isOpen ? styles.tagOpenText : styles.tagClosedText}>
                  {item.isOpen ? 'مفتوح' : 'مغلق'}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSizes.sm,
    color: colors.text.primary,
    textAlign: 'right',
    fontFamily: fontFamilies.body,
  },
  chipsRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  chip: {
    backgroundColor: colors.soft,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    marginRight: spacing.xs,
  },
  chipOn: { backgroundColor: colors.brand.red },
  chipText: {
    color: colors.ink,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyBold,
  },
  chipTextOn: { color: colors.white },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  empty: {
    textAlign: 'center',
    color: colors.text.muted,
    marginTop: spacing.xl,
    fontFamily: fontFamilies.body,
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
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
  },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  cardSub: { fontSize: fontSizes.xs, color: colors.text.muted, fontFamily: fontFamilies.body },
  cardAddress: {
    fontSize: 10,
    color: colors.text.muted,
    marginTop: 2,
    fontFamily: fontFamilies.body,
  },
  pressed: { opacity: 0.85 },
  tagOpen: {
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  tagOpenText: {
    color: colors.success,
    fontSize: 10,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  tagClosed: {
    backgroundColor: '#F3F3F3',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  tagClosedText: {
    color: colors.text.muted,
    fontSize: 10,
    fontFamily: fontFamilies.bodyExtraBold,
  },
});
