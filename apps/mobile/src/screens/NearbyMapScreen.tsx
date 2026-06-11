import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import {
  Crosshair,
  MapPin,
  Pill,
  Search,
  ShoppingBag,
  Star,
  Store,
  Utensils,
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
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

const DEFAULT_REGION = {
  latitude: 26.0297,
  longitude: 32.8146,
  latitudeDelta: 0.03,
  longitudeDelta: 0.03,
};

// Category filter chips — uses categoryId or a fuzzy nameAr match
type Filter = { key: string; label: string; icon: typeof Store; match: (m: Merchant) => boolean };
const FILTERS: Filter[] = [
  { key: 'all', label: 'الكل', icon: Store, match: () => true },
  {
    key: 'restaurants',
    label: 'مطاعم',
    icon: Utensils,
    match: (m) => m.category?.id === 'restaurants' || /مطعم|مطاعم/.test(m.category?.nameAr ?? ''),
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
    match: (m) =>
      m.category?.id === 'sweets' || /حلوى|حلويات|سكر|sweet/i.test(m.category?.nameAr ?? ''),
  },
];

// Pin color per category
function pinFor(m: Merchant): { color: string } {
  const id = m.category?.id;
  const ar = m.category?.nameAr ?? '';
  if (id === 'restaurants' || /مطعم|مطاعم/.test(ar)) return { color: '#EC7A2C' };
  if (id === 'supermarkets' || /سوبر|ماركت|بقالة/.test(ar)) return { color: '#E0301E' };
  if (id === 'pharmacies' || /صيدل/.test(ar)) return { color: '#10B981' };
  if (id === 'sweets' || /حلوى|حلويات/.test(ar)) return { color: '#F2A93B' };
  return { color: '#241310' };
}

const RADIUS_KM = 5;

export function NearbyMapScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState(route.params?.search ?? '');
  const mapRef = useRef<MapView | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({});
      const next = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setUserLoc(next);
      setRegion((r) => ({ ...r, latitude: next.lat, longitude: next.lng }));
    })();
  }, []);

  const recenter = () => {
    if (!userLoc || !mapRef.current) return;
    mapRef.current.animateToRegion(
      {
        latitude: userLoc.lat,
        longitude: userLoc.lng,
        latitudeDelta: 0.03,
        longitudeDelta: 0.03,
      },
      500,
    );
  };

  const { data: merchants, isLoading } = useQuery<Merchant[]>({
    queryKey: ['merchants-near', userLoc],
    queryFn: () => {
      const params: Record<string, number> = {};
      if (userLoc) {
        params.lat = userLoc.lat;
        params.lng = userLoc.lng;
        params.radiusKm = 10;
      }
      return api.raw.get('/merchants', { params }).then((r) => r.data.data);
    },
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

  const openMerchant = (m: Merchant) => {
    navigation.navigate('MerchantDetail', { merchantId: m.id });
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <GradientHeader greeting="متاجر قريبة منك" location="قفط — قنا" />

      {/* Floating search */}
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

      {/* Filter chips */}
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

      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          region={region}
          showsUserLocation
          showsMyLocationButton={false}
        >
          {/* Delivery radius circle around user */}
          {userLoc && (
            <Circle
              center={{ latitude: userLoc.lat, longitude: userLoc.lng }}
              radius={RADIUS_KM * 1000}
              strokeColor="rgba(224,48,30,0.4)"
              fillColor="rgba(224,48,30,0.06)"
              strokeWidth={1.5}
            />
          )}

          {filtered.map((m) => {
            const p = pinFor(m);
            return (
              <Marker
                key={m.id}
                coordinate={{ latitude: Number(m.lat), longitude: Number(m.lng) }}
                title={m.storeNameAr}
                description={`${m.category?.nameAr ?? ''}${m.distanceKm ? ` · ${m.distanceKm.toFixed(1)} كم` : ''}`}
                pinColor={p.color}
                onPress={() => openMerchant(m)}
              />
            );
          })}
        </MapView>

        {/* Recenter FAB */}
        <Pressable onPress={recenter} style={styles.recenterBtn}>
          <Crosshair size={20} color={colors.brand.red} />
        </Pressable>
      </View>

      {/* Bottom sheet */}
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
            {/* Let the ScrollView handle overflow — slice(0,6) used to hide
                most of the list and the bottom-sheet counter was misleading. */}
            {filtered.map((m) => {
              const p = pinFor(m);
              return (
                <Pressable
                  key={m.id}
                  onPress={() => openMerchant(m)}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
                >
                  <View style={[styles.rowIcon, { backgroundColor: `${p.color}1A` }]}>
                    <MapPin size={18} color={p.color} />
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
    elevation: 6,
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
  mapWrap: { flex: 1, position: 'relative' },
  map: { flex: 1 },
  recenterBtn: {
    position: 'absolute',
    bottom: spacing.md,
    insetInlineStart: spacing.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
    elevation: 6,
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    maxHeight: '45%',
    boxShadow: '0 -4px 16px rgba(0,0,0,0.10)',
    elevation: 6,
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
  sheetTitle: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.headingBlack,
    color: colors.ink,
  },
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
