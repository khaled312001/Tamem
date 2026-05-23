import { useQuery } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronRight, Clock, MapPin, Star, Store } from 'lucide-react-native';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '../components/GradientButton';
import { api } from '../lib/api';
import type { HomeStackParamList } from '../navigation/HomeStack';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

interface MerchantDetail {
  id: string;
  storeNameAr: string;
  description?: string;
  logoUrl?: string;
  coverUrl?: string;
  addressLine: string;
  rating?: number | null;
  isOpen: boolean;
  category?: { nameAr: string };
  products?: Array<{ id: string; nameAr: string; price: number; imageUrl?: string }>;
}

type RouteParam = RouteProp<HomeStackParamList, 'MerchantDetail'>;
type NavProp = NativeStackNavigationProp<HomeStackParamList, 'MerchantDetail'>;

export function MerchantDetailScreen() {
  const route = useRoute<RouteParam>();
  const navigation = useNavigation<NavProp>();
  const { merchantId } = route.params;

  const { data, isLoading } = useQuery<MerchantDetail>({
    queryKey: ['merchant', merchantId],
    queryFn: () => api.raw.get(`/merchants/${merchantId}`).then((r) => r.data.data),
  });

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={colors.brand.red} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.empty}>المتجر غير موجود</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Cover */}
        <View style={styles.cover}>
          {data.coverUrl ? (
            <Image source={{ uri: data.coverUrl }} style={styles.coverImage} resizeMode="cover" />
          ) : (
            <View style={styles.coverPlaceholder}>
              <Store size={48} color={colors.white} />
            </View>
          )}
        </View>

        {/* Info card */}
        <View style={styles.card}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{data.storeNameAr}</Text>
            <View style={data.isOpen ? styles.tagOpen : styles.tagClosed}>
              <Text style={data.isOpen ? styles.tagOpenText : styles.tagClosedText}>
                {data.isOpen ? 'مفتوح' : 'مغلق'}
              </Text>
            </View>
          </View>
          {data.category && <Text style={styles.subtitle}>{data.category.nameAr}</Text>}

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Star size={14} color={colors.brand.gold} fill={colors.brand.gold} />
              <Text style={styles.metaText}>{Number(data.rating ?? 0).toFixed(1)}</Text>
            </View>
            <View style={styles.metaItem}>
              <Clock size={14} color={colors.text.muted} />
              <Text style={styles.metaText}>20-40 دقيقة</Text>
            </View>
            <View style={styles.metaItem}>
              <MapPin size={14} color={colors.text.muted} />
              <Text style={styles.metaText} numberOfLines={1}>
                {data.addressLine}
              </Text>
            </View>
          </View>

          {data.description && <Text style={styles.description}>{data.description}</Text>}
        </View>

        {/* Products */}
        {data.products && data.products.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>المنتجات</Text>
            {data.products.map((p) => (
              <View key={p.id} style={styles.productRow}>
                <View style={styles.productImg}>
                  {p.imageUrl ? (
                    <Image source={{ uri: p.imageUrl }} style={{ width: '100%', height: '100%' }} />
                  ) : (
                    <Store size={20} color={colors.brand.red} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.productName}>{p.nameAr}</Text>
                  <Text style={styles.productPrice}>{p.price} ج.م</Text>
                </View>
                <ChevronRight size={16} color={colors.text.muted} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Order CTA */}
      <View style={styles.cta}>
        <GradientButton
          label="اطلب الآن"
          onPress={() => {
            // Open dynamic service flow for "supermarket delivery" by default
            navigation.navigate('DynamicServiceFlow', {
              serviceKey: 'delivery-supermarket',
              merchantId: data.id,
            });
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  cover: { height: 180, backgroundColor: colors.brand.red },
  coverImage: { width: '100%', height: '100%' },
  coverPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: colors.white,
    margin: spacing.lg,
    marginTop: -32,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderColor: colors.line,
    borderWidth: 1,
    boxShadow: '0 6px 14px rgba(0,0,0,0.06)',
    elevation: 3,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: {
    flex: 1,
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.headingBlack,
    color: colors.ink,
  },
  subtitle: {
    fontSize: fontSizes.sm,
    color: colors.text.muted,
    marginTop: 4,
    fontFamily: fontFamilies.body,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
    flexWrap: 'wrap',
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: {
    fontSize: fontSizes.xs,
    color: colors.text.secondary,
    fontFamily: fontFamilies.body,
  },
  description: {
    fontSize: fontSizes.sm,
    color: colors.text.secondary,
    marginTop: spacing.md,
    lineHeight: 22,
    fontFamily: fontFamilies.body,
  },
  section: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  sectionTitle: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.headingBlack,
    color: colors.ink,
    marginBottom: spacing.md,
  },
  productRow: {
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
  productImg: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  productName: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
  },
  productPrice: {
    fontSize: fontSizes.xs,
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyBold,
    marginTop: 2,
  },
  cta: {
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  empty: {
    textAlign: 'center',
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    marginTop: spacing.xxl,
  },
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
