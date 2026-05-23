import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { MapPin, Star } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientHeader } from '../components/GradientHeader';
import { api } from '../lib/api';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

interface Merchant {
  id: string;
  storeNameAr: string;
  lat: number;
  lng: number;
  rating?: number | null;
  isOpen: boolean;
  category?: { nameAr: string };
  distanceKm?: number;
}

// Default to Qift center until permission granted
const DEFAULT_REGION = {
  latitude: 26.0297,
  longitude: 32.8146,
  latitudeDelta: 0.03,
  longitudeDelta: 0.03,
};

export function NearbyMapScreen() {
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({});
      const next = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setUserLoc(next);
      setRegion({ ...region, latitude: next.lat, longitude: next.lng });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <GradientHeader greeting="متاجر قريبة منك" location="قفط — قنا" />

      <MapView provider={PROVIDER_GOOGLE} style={styles.map} region={region} showsUserLocation>
        {(merchants ?? []).map((m) => (
          <Marker
            key={m.id}
            coordinate={{ latitude: Number(m.lat), longitude: Number(m.lng) }}
            title={m.storeNameAr}
            description={m.category?.nameAr}
            pinColor={colors.brand.red}
          />
        ))}
      </MapView>

      {/* Bottom sheet (static) */}
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.sheetTitle}>أقرب المتاجر إليك</Text>
        {isLoading ? (
          <ActivityIndicator color={colors.brand.red} style={{ margin: spacing.md }} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {(merchants ?? []).slice(0, 5).map((m) => (
              <Pressable key={m.id} style={styles.row}>
                <View style={styles.rowIcon}>
                  <MapPin size={18} color={colors.brand.red} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{m.storeNameAr}</Text>
                  <View style={styles.rowMeta}>
                    <Star size={10} color={colors.brand.gold} fill={colors.brand.gold} />
                    <Text style={styles.rowMetaText}>
                      {Number(m.rating ?? 0).toFixed(1)}
                      {m.distanceKm !== undefined && ` · ${m.distanceKm.toFixed(1)} كم`}
                    </Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  map: { flex: 1 },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    maxHeight: '40%',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
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
  sheetTitle: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.headingBlack,
    color: colors.ink,
    marginBottom: spacing.sm,
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
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
  },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  rowMetaText: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
  },
});
