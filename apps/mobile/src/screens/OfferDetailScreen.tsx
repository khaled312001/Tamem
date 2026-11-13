/**
 * One offer, in full: the picture, then its title and the whole description
 * (the home slider only has room for two lines of it), and a button into the
 * stores, or straight to the store the offer belongs to.
 */
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { Share2, ShoppingBag, Store } from 'lucide-react-native';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/ScreenHeader';
import { Image } from '../components/ui/CachedImage';
import { EmptyState, PrimaryButton } from '../components/ui';
import { api } from '../lib/api';
import { shareItem } from '../lib/shareLinks';
import type { HomeStackParamList } from '../navigation/HomeStack';
import type { Offer } from './home/homeData';
import { colors, fontFamilies, radii, shadows, spacing } from '../theme/tokens';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'OfferDetail'>;
type Rt = RouteProp<HomeStackParamList, 'OfferDetail'>;

const RATIO = 1600 / 600;

export function OfferDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const { width } = useWindowDimensions();
  // Same cache entry the home slider filled, so this opens instantly.
  const { data, isLoading } = useQuery<Offer[]>({
    queryKey: ['offers'],
    queryFn: () => api.raw.get('/offers').then((r) => r.data.data),
    staleTime: 60_000,
  });
  const offer = data?.find((o) => o.id === params.offerId);
  const imgW = width - spacing.lg * 2;

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader
        title="العرض"
        rightIcon={offer ? Share2 : undefined}
        rightLabel="شارك العرض"
        onPressRight={
          offer
            ? () =>
                shareItem('o', offer.id, [
                  `🎁 ${offer.titleAr || offer.title}`,
                  offer.descriptionAr,
                  'على تطبيق تميم للتوصيل 🚚',
                ])
            : undefined
        }
      />
      {/* Opened from a shared link the offers list isn't cached yet: wait for
          it instead of flashing «العرض ده خلص». */}
      {!offer && isLoading ? (
        <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.brand.red} />
      ) : !offer ? (
        <EmptyState title="العرض ده خلص" subtitle="شوف العروض التانية في الصفحة الرئيسية" />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {!!offer.imageUrl && (
            <View style={[styles.imageCard, { width: imgW, height: imgW / RATIO }]}>
              <Image
                source={{ uri: offer.imageUrl }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
            </View>
          )}
          <Text style={styles.title}>{offer.titleAr || offer.title}</Text>
          {!!offer.descriptionAr && <Text style={styles.desc}>{offer.descriptionAr}</Text>}
          <View style={{ marginTop: spacing.xl }}>
            {offer.linkType === 'MERCHANT' && offer.linkValue ? (
              <PrimaryButton
                label="روح للمحل"
                Icon={Store}
                onPress={() =>
                  navigation.navigate('MerchantDetail', { merchantId: String(offer.linkValue) })
                }
              />
            ) : (
              <PrimaryButton
                label="اطلب دلوقتي"
                Icon={ShoppingBag}
                onPress={() => navigation.navigate('StoresList')}
              />
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  imageCard: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: colors.brand.redLight,
    ...shadows.sm,
  },
  title: {
    marginTop: spacing.lg,
    color: colors.ink,
    fontSize: 20,
    fontFamily: fontFamilies.bodyExtraBold,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  desc: {
    marginTop: spacing.sm,
    color: colors.text.muted,
    fontSize: 15,
    lineHeight: 26,
    fontFamily: fontFamilies.body,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
