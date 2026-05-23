// Web fallback for NearbyMapScreen — react-native-maps doesn't support web.
// We render the merchant list only, no interactive map.
import { useQuery } from '@tanstack/react-query';
import { MapPin, Star } from 'lucide-react-native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientHeader } from '../components/GradientHeader';
import { api } from '../lib/api';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

interface Merchant {
  id: string;
  storeNameAr: string;
  rating?: number | null;
  isOpen: boolean;
  category?: { nameAr: string };
}

export function NearbyMapScreen() {
  const { data: merchants, isLoading } = useQuery<Merchant[]>({
    queryKey: ['merchants'],
    queryFn: () => api.raw.get('/merchants').then((r) => r.data.data),
  });

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <GradientHeader greeting="متاجر قريبة منك" location="قفط — قنا" />

      <View style={styles.banner}>
        <MapPin size={28} color={colors.brand.red} />
        <Text style={styles.bannerTitle}>الخريطة متاحة على الموبايل فقط</Text>
        <Text style={styles.bannerSub}>
          افتح التطبيق على Expo Go أو APK لاستعراض الخريطة التفاعلية. عرض القائمة بدلاً منها هنا:
        </Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.brand.red} style={{ marginTop: spacing.xl }} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {(merchants ?? []).map((m) => (
            <Pressable
              key={m.id}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.rowIcon}>
                <MapPin size={18} color={colors.brand.red} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{m.storeNameAr}</Text>
                <View style={styles.rowMeta}>
                  <Star size={10} color={colors.brand.gold} fill={colors.brand.gold} />
                  <Text style={styles.rowMetaText}>
                    {Number(m.rating ?? 0).toFixed(1)} · {m.category?.nameAr ?? '—'}
                  </Text>
                </View>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  banner: {
    margin: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.brand.redLight,
    borderRadius: radii.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  bannerTitle: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.headingBold,
    color: colors.brand.redDark,
    textAlign: 'center',
  },
  bannerSub: {
    fontSize: fontSizes.sm,
    color: colors.text.secondary,
    fontFamily: fontFamilies.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  row: {
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
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyExtraBold, color: colors.ink },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  rowMetaText: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
  },
});
