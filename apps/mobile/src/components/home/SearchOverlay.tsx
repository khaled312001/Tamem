/**
 * SearchOverlay — full-screen Modal that slides up from a tiny collapsed
 * search pill on the home screen. While the user types, we hit the
 * /merchants and /products endpoints with a 300ms debounce and show
 * live suggestions grouped by kind. Tapping a suggestion navigates to
 * the matching screen. "Enter" or the submit chevron opens the regular
 * stores list with the query as a search filter.
 *
 * The expand-from-pill animation: the modal lifts the input from the
 * pill's exact y-position to the top of the screen while it opens, so
 * the transition feels like the pill itself is unfolding.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Package, Search, Store, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../lib/api';
import type { HomeStackParamList } from '../../navigation/HomeStack';
import { colors, fontFamilies, fontSizes, radii, shadows, spacing } from '../../theme/tokens';

type NavProp = NativeStackNavigationProp<HomeStackParamList, 'Home'>;

interface MerchantSuggestion {
  id: string;
  storeNameAr: string;
  logoUrl?: string | null;
  categoryId?: string | null;
}

interface ProductSuggestion {
  id: string;
  nameAr: string;
  imageUrl?: string | null;
  price: number;
  merchant?: { id: string; storeNameAr: string };
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

const useNative = Platform.OS !== 'web';

export function SearchOverlay({ visible, onClose }: Props) {
  const navigation = useNavigation<NavProp>();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const inputRef = useRef<TextInput>(null);

  // Slide-up + fade animation
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 280 : 200,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: useNative,
    }).start();

    if (visible) {
      // Auto-focus the input the moment the overlay opens.
      const t = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(t);
    } else {
      // Clear the query when the overlay closes so re-opens start fresh.
      setQuery('');
      setDebounced('');
    }
  }, [visible, progress]);

  // 300ms debounce so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const enabled = debounced.length >= 2;

  const merchantQ = useQuery({
    queryKey: ['search-merchants', debounced],
    queryFn: () =>
      api.raw
        .get('/merchants', { params: { search: debounced, pageSize: 6 } })
        .then((r) => (r.data.data ?? []) as MerchantSuggestion[]),
    enabled,
    staleTime: 30_000,
  });

  const productQ = useQuery({
    queryKey: ['search-products', debounced],
    queryFn: () =>
      api.raw
        .get('/products', { params: { search: debounced, pageSize: 6 } })
        .then((r) => (r.data.data ?? []) as ProductSuggestion[]),
    enabled,
    staleTime: 30_000,
  });

  const isLoading = enabled && (merchantQ.isLoading || productQ.isLoading);
  const merchants = merchantQ.data ?? [];
  const products = productQ.data ?? [];
  const totalSuggestions = merchants.length + products.length;

  const goToMerchant = (id: string) => {
    onClose();
    navigation.navigate('MerchantDetail', { merchantId: id });
  };
  const goToProduct = (id: string) => {
    onClose();
    navigation.navigate('ProductDetail', { productId: id });
  };
  const submit = () => {
    if (!query.trim()) return;
    onClose();
    navigation.navigate('StoresList', { search: query.trim() });
  };

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });
  const backdropOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  const emptyHint = useMemo(() => {
    if (!query) return 'ابدأ تكتب اسم المتجر، المنتج، أو الخدمة';
    if (query.length < 2) return 'اكتب على الأقل حرفين';
    if (!isLoading && totalSuggestions === 0) return 'مفيش نتائج لـ "' + query + '"';
    return null;
  }, [query, isLoading, totalSuggestions]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
      <SafeAreaView edges={['top']} style={styles.safe}>
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          {/* Search input row */}
          <View style={styles.inputRow}>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={10}>
              <ArrowRight size={20} color={colors.ink} />
            </Pressable>
            <View style={styles.inputWrap}>
              <Search size={18} color={colors.text.muted} />
              <TextInput
                ref={inputRef}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={submit}
                returnKeyType="search"
                placeholder="ابحث عن مطعم، محل، أو منتج…"
                placeholderTextColor={colors.text.muted}
                style={styles.input}
              />
              {query.length > 0 && (
                <Pressable onPress={() => setQuery('')} hitSlop={8}>
                  <X size={18} color={colors.text.muted} />
                </Pressable>
              )}
            </View>
          </View>

          {/* Suggestions list */}
          <View style={styles.body}>
            {emptyHint && (
              <View style={styles.empty}>
                <Search size={28} color={colors.text.muted} />
                <Text style={styles.emptyText}>{emptyHint}</Text>
              </View>
            )}

            {isLoading && (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.brand.red} />
              </View>
            )}

            {!isLoading && merchants.length > 0 && (
              <View style={styles.group}>
                <Text style={styles.groupTitle}>متاجر</Text>
                {merchants.map((m) => (
                  <Pressable
                    key={m.id}
                    onPress={() => goToMerchant(m.id)}
                    style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
                  >
                    {m.logoUrl ? (
                      <Image source={{ uri: m.logoUrl }} style={styles.thumb} />
                    ) : (
                      <View style={[styles.thumb, styles.thumbFallback]}>
                        <Store size={18} color={colors.brand.red} />
                      </View>
                    )}
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {m.storeNameAr}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {!isLoading && products.length > 0 && (
              <View style={styles.group}>
                <Text style={styles.groupTitle}>منتجات</Text>
                {products.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => goToProduct(p.id)}
                    style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
                  >
                    {p.imageUrl ? (
                      <Image source={{ uri: p.imageUrl }} style={styles.thumb} />
                    ) : (
                      <View style={[styles.thumb, styles.thumbFallback]}>
                        <Package size={18} color={colors.brand.red} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {p.nameAr}
                      </Text>
                      {p.merchant && (
                        <Text style={styles.rowSub} numberOfLines={1}>
                          {p.merchant.storeNameAr}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.rowPrice}>
                      {Number(p.price).toLocaleString('ar-EG')} ج.م
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </Animated.View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  safe: { flex: 1 },
  sheet: {
    flex: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    marginTop: 0,
    ...shadows.md,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  input: {
    flex: 1,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.ink,
    textAlign: 'right',
    paddingVertical: 0,
  },
  body: { flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyText: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.sm,
    textAlign: 'center',
  },
  loading: { paddingVertical: spacing.lg },
  group: { marginBottom: spacing.lg },
  groupTitle: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  rowTitle: {
    flex: 1,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.ink,
  },
  rowSub: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    marginTop: 1,
  },
  rowPrice: {
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.sm,
    color: colors.brand.red,
  },
});
