// Web fallback for NearbyMapScreen — react-native-maps doesn't support web.
// We render an OpenStreetMap iframe (no API key needed) + the same filter
// chips/search/cards layout as native, so the visual + functional parity
// matches the mobile screen.
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Pill, Search, ShoppingBag, Star, Store, Utensils } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import type { HomeStackParamList } from '../navigation/HomeStack';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

interface Merchant {
  id: string;
  storeNameAr: string;
  lat: number;
  lng: number;
  rating?: number | null;
  isOpen: boolean;
  category?: { id?: string; nameAr: string };
  distanceKm?: number;
}

type Nav = NativeStackNavigationProp<HomeStackParamList, 'NearbyMap'>;
type Route = RouteProp<HomeStackParamList, 'NearbyMap'>;

type Filter = { key: string; label: string; icon: typeof Store; match: (m: Merchant) => boolean };
const FILTERS: Filter[] = [
  { key: 'all', label: 'الكل', icon: Store, match: () => true },
  {
    key: 'restaurants',
    label: 'مطاعم',
    icon: Utensils,
    match: (m) => m.category?.id === 'restaurants' || /مطعم/.test(m.category?.nameAr ?? ''),
  },
  {
    key: 'supermarkets',
    label: 'ماركت',
    icon: ShoppingBag,
    match: (m) =>
      m.category?.id === 'supermarkets' || /سوبر|ماركت|بقالة/.test(m.category?.nameAr ?? ''),
  },
  {
    key: 'pharmacies',
    label: 'صيدليات',
    icon: Pill,
    match: (m) => m.category?.id === 'pharmacies' || /صيدل/.test(m.category?.nameAr ?? ''),
  },
  {
    key: 'sweets',
    label: 'حلويات',
    icon: ShoppingBag,
    match: (m) => m.category?.id === 'sweets' || /حلوى|حلويات/.test(m.category?.nameAr ?? ''),
  },
];

function pinColor(m: Merchant): string {
  const id = m.category?.id;
  const ar = m.category?.nameAr ?? '';
  if (id === 'restaurants' || /مطعم/.test(ar)) return '#EC7A2C';
  if (id === 'supermarkets' || /سوبر|ماركت|بقالة/.test(ar)) return '#E0301E';
  if (id === 'pharmacies' || /صيدل/.test(ar)) return '#10B981';
  if (id === 'sweets' || /حلوى|حلويات/.test(ar)) return '#F2A93B';
  return '#241310';
}

// Qift center
const QIFT = { lat: 26.0297, lng: 32.8146 };

export function NearbyMapScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState(route.params?.search ?? '');

  const { data: merchants, isLoading } = useQuery<Merchant[]>({
    queryKey: ['merchants-near-web'],
    queryFn: () =>
      api.raw.get('/merchants', { params: { ...QIFT, radiusKm: 10 } }).then((r) => r.data.data),
  });

  const activeFilter = FILTERS.find((f) => f.key === filter);
  const matcher = activeFilter?.match ?? (() => true);
  const filtered = useMemo(() => {
    const q = search.trim();
    return (merchants ?? [])
      .filter(matcher)
      .filter((m) => !q || m.storeNameAr.includes(q))
      .sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99));
  }, [merchants, matcher, search]);

  // Bounding box around Qift for the OpenStreetMap embed
  const bbox = '32.78,26.00,32.85,26.06';
  const mapSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${QIFT.lat},${QIFT.lng}`;

  const openMerchant = (m: Merchant) => {
    navigation.navigate('MerchantDetail', { merchantId: m.id });
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <GradientHeader greeting="متاجر قريبة منك" location="قفط — قنا" />

      <View style={styles.searchOverlay}>
        <View style={styles.searchBar}>
          <Search size={16} color={colors.text.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="ابحث عن مطعم أو متجر..."
            placeholderTextColor={colors.text.muted}
            style={styles.searchInput}
          />
        </View>
      </View>

      <View style={styles.chipsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {FILTERS.map((f) => {
            const active = f.key === filter;
            const Icon = f.icon;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Icon size={14} color={active ? colors.white : colors.brand.red} />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Embedded OpenStreetMap via iframe (web only). Interactive map with
          per-merchant markers is mobile-only — surfaced via a banner so the
          web user knows where to find the real thing. */}
      <View style={styles.mapWrap}>
        {/* eslint-disable-next-line react/forbid-elements */}
        <iframe
          src={mapSrc}
          style={{ border: 0, width: '100%', height: '100%' }}
          title="خريطة قفط"
          loading="lazy"
        />
        <View style={styles.webMapBanner} pointerEvents="none">
          <Text style={styles.webMapBannerText}>
            الخريطة التفاعلية بدبابيس المتاجر وموقعك مباشرة متاحة على تطبيق الموبايل.
          </Text>
        </View>
      </View>

      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>أقرب المتاجر إليك</Text>
          <Text style={styles.sheetCount}>{filtered.length} متجر</Text>
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.brand.red} style={{ margin: spacing.md }} />
        ) : filtered.length === 0 ? (
          <Text style={styles.empty}>لا توجد متاجر تطابق الفلتر</Text>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {filtered.slice(0, 6).map((m) => {
              const color = pinColor(m);
              return (
                <Pressable
                  key={m.id}
                  onPress={() => openMerchant(m)}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
                >
                  <View style={[styles.rowIcon, { backgroundColor: `${color}1A` }]}>
                    <MapPin size={18} color={color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowTitleRow}>
                      <Text style={styles.rowTitle}>{m.storeNameAr}</Text>
                      <View style={m.isOpen ? styles.tagOpen : styles.tagClosed}>
                        <Text style={m.isOpen ? styles.tagOpenText : styles.tagClosedText}>
                          {m.isOpen ? 'مفتوح' : 'مغلق'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.rowMeta}>
                      <Star size={10} color={colors.brand.gold} fill={colors.brand.gold} />
                      <Text style={styles.rowMetaText}>{Number(m.rating ?? 0).toFixed(1)}</Text>
                      <Text style={styles.dot}>·</Text>
                      <Text style={styles.rowMetaText}>{m.category?.nameAr ?? '—'}</Text>
                      {m.distanceKm !== undefined && (
                        <>
                          <Text style={styles.dot}>·</Text>
                          <Text style={styles.distance}>{m.distanceKm.toFixed(1)} كم</Text>
                          <Text style={styles.dot}>·</Text>
                          <Text style={styles.eta}>
                            ~{Math.max(10, Math.round(m.distanceKm * 8))} د
                          </Text>
                        </>
                      )}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  searchOverlay: { paddingHorizontal: spacing.md, marginTop: -spacing.lg, zIndex: 10 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    boxShadow: '0 6px 18px rgba(0,0,0,0.10)',
  },
  searchInput: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.body,
    color: colors.text.primary,
    textAlign: 'right',
  },
  chipsWrap: { paddingVertical: spacing.sm },
  chipsRow: { paddingHorizontal: spacing.md, gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    borderColor: colors.brand.red,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  chipActive: { backgroundColor: colors.brand.red },
  chipText: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.brand.red,
  },
  chipTextActive: { color: colors.white },
  mapWrap: { flex: 1, position: 'relative', backgroundColor: '#E5E7EB' },
  webMapBanner: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
    backgroundColor: 'rgba(36,19,16,0.85)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  webMapBannerText: {
    color: colors.white,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
    textAlign: 'center',
    lineHeight: 18,
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    maxHeight: '45%',
    boxShadow: '0 -4px 16px rgba(0,0,0,0.10)',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 99,
    backgroundColor: colors.line2,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sheetTitle: { fontSize: fontSizes.sm, fontFamily: fontFamilies.headingBlack, color: colors.ink },
  sheetCount: { fontSize: fontSizes.xs, color: colors.text.muted, fontFamily: fontFamilies.body },
  empty: {
    textAlign: 'center',
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    paddingVertical: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowTitle: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
    flex: 1,
  },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, flexWrap: 'wrap' },
  rowMetaText: { fontSize: fontSizes.xs, color: colors.text.muted, fontFamily: fontFamilies.body },
  dot: { color: colors.text.muted, fontSize: fontSizes.xs },
  distance: {
    fontSize: fontSizes.xs,
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  eta: { fontSize: fontSizes.xs, color: colors.brand.gold, fontFamily: fontFamilies.bodyExtraBold },
  tagOpen: {
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  tagOpenText: { color: colors.success, fontSize: 10, fontFamily: fontFamilies.bodyExtraBold },
  tagClosed: {
    backgroundColor: '#F3F3F3',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  tagClosedText: { color: colors.text.muted, fontSize: 10, fontFamily: fontFamilies.bodyExtraBold },
});
