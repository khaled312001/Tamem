import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fontFamilies, radii, spacing } from '../theme/tokens';

const SERVICES = [
  { key: 'delivery', label: 'دليفري', sub: 'داخل المدينة', color: colors.brand.red },
  { key: 'shipping', label: 'شحن', sub: 'بين المناطق', color: colors.brand.orange },
  { key: 'merchant', label: 'تاجر', sub: 'طلبات جملة', color: colors.brand.gold },
];

export function HomeScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>أهلاً 👋</Text>
            <Text style={styles.location}>قفط — قنا</Text>
          </View>
        </View>

        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>خصم 20% على أول طلب</Text>
          <Text style={styles.bannerSub}>استخدم كود TAMEM20 — لفترة محدودة</Text>
        </View>

        <Text style={styles.sectionTitle}>خدماتنا</Text>
        <View style={styles.services}>
          {SERVICES.map((s) => (
            <Pressable
              key={s.key}
              style={({ pressed }) => [
                styles.serviceCard,
                { backgroundColor: s.color },
                pressed && styles.cardPressed,
              ]}
            >
              <Text style={styles.serviceLabel}>{s.label}</Text>
              <Text style={styles.serviceSub}>{s.sub}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.placeholder}>
          المزيد من المكونات (Categories, Nearby Stores, Top Stores) — Phase 2.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xl },
  greeting: {
    fontSize: 20,
    fontFamily: fontFamilies.heading,
    fontWeight: '900',
    color: colors.text.primary,
  },
  location: { fontSize: 12, color: colors.text.muted, marginTop: 2 },
  banner: {
    backgroundColor: colors.brand.dark,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  bannerTitle: { color: colors.brand.gold, fontWeight: '800', fontSize: 18, marginBottom: 4 },
  bannerSub: { color: colors.white, fontSize: 13 },
  sectionTitle: {
    fontSize: 18,
    fontFamily: fontFamilies.heading,
    fontWeight: '900',
    marginBottom: spacing.md,
    color: colors.text.primary,
  },
  services: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  serviceCard: {
    flex: 1,
    padding: spacing.lg,
    borderRadius: radii.lg,
    alignItems: 'center',
  },
  cardPressed: { opacity: 0.85 },
  serviceLabel: { color: colors.white, fontWeight: '900', fontSize: 16, marginBottom: 4 },
  serviceSub: { color: colors.white, fontSize: 11, opacity: 0.9 },
  placeholder: {
    color: colors.text.muted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
