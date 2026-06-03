/**
 * EasyKash checkout entry point.
 *
 * Replaces the old per-method picker — EasyKash hosts a single page that
 * shows all enabled methods (Visa, MasterCard, فودافون كاش, InstaPay,
 * Meeza) and the customer picks there. Mobile only needs:
 *
 *   1. Fetch the order so we can show the amount.
 *   2. Tap "ادفع الآن" → POST /payments/orders/:id/checkout (empty body).
 *   3. Backend returns { redirectUrl } pointing at easykash.net.
 *   4. Open it in the system browser (expo-web-browser) so 3-D Secure /
 *      Vodafone OTP work natively.
 *   5. When the browser closes, navigate back. The webhook on the backend
 *      flips the order to PAID + ACCEPTED, and the OrderTracking screen
 *      live-updates via Socket.IO.
 */
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { CheckCircle2, CreditCard, Info, Shield } from 'lucide-react-native';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '../components/GradientButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { api } from '../lib/api';
import type { OrdersStackParamList } from '../navigation/OrdersStack';
import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

type EasyKashRoute = RouteProp<OrdersStackParamList, 'EasyKashCheckout'>;

interface OrderSummary {
  id: string;
  orderNumber: string;
  quotedPrice?: number;
  finalPrice?: number;
}

interface PaymentsConfig {
  gateway: string;
  online: boolean;
  methods: {
    vodafoneCash: boolean;
    instapay: boolean;
    visa: boolean;
    mastercard: boolean;
    meeza: boolean;
  };
}

export function EasyKashCheckoutScreen() {
  const route = useRoute<EasyKashRoute>();
  const navigation = useNavigation();
  const { orderId } = route.params;

  const order = useQuery({
    queryKey: ['order', orderId],
    queryFn: async (): Promise<OrderSummary> => {
      const res = await api.raw.get(`/orders/${orderId}`);
      return res.data.data as OrderSummary;
    },
  });

  const config = useQuery({
    queryKey: ['payments-config'],
    queryFn: async (): Promise<PaymentsConfig> => {
      const res = await api.raw.get('/payments/config');
      return res.data.data as PaymentsConfig;
    },
  });

  const amount = order.data?.quotedPrice ?? order.data?.finalPrice ?? 0;

  const checkout = useMutation({
    mutationFn: async () => {
      const res = await api.raw.post(`/payments/orders/${orderId}/checkout`, {});
      return res.data.data as { redirectUrl: string };
    },
    onSuccess: async ({ redirectUrl }) => {
      try {
        if (Platform.OS === 'web') {
          window.open(redirectUrl, '_blank', 'noopener');
        } else {
          await WebBrowser.openBrowserAsync(redirectUrl, {
            toolbarColor: colors.brand.red,
            controlsColor: colors.white,
            dismissButtonStyle: 'cancel',
          });
        }
      } finally {
        navigation.goBack();
      }
    },
    onError: (err: unknown) => {
      Alert.alert('تعذّر بدء الدفع', err instanceof Error ? err.message : 'حاول مرة أخرى');
    },
  });

  if (order.isLoading || config.isLoading) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScreenHeader title="الدفع الإلكتروني" />
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.brand.red} />
      </SafeAreaView>
    );
  }

  if (!order.data) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScreenHeader title="الدفع الإلكتروني" />
        <Text style={styles.errorBox}>تعذّر تحميل بيانات الطلب.</Text>
      </SafeAreaView>
    );
  }

  if (amount <= 0) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScreenHeader title="الدفع الإلكتروني" />
        <Text style={styles.errorBox}>الطلب لم يُسعّر بعد. انتظر تأكيد السعر ثم حاول.</Text>
      </SafeAreaView>
    );
  }

  if (!config.data?.online) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScreenHeader title="الدفع الإلكتروني" />
        <Text style={styles.errorBox}>
          الدفع الإلكتروني غير مفعّل حالياً. ادفع كاش عند الاستلام أو تواصل مع الدعم.
        </Text>
      </SafeAreaView>
    );
  }

  const methods = config.data.methods;
  const labelledMethods: Array<{ label: string; enabled: boolean }> = [
    { label: 'فودافون كاش', enabled: methods.vodafoneCash },
    { label: 'InstaPay', enabled: methods.instapay },
    { label: 'Visa', enabled: methods.visa },
    { label: 'MasterCard', enabled: methods.mastercard },
    { label: 'Meeza', enabled: methods.meeza },
  ].filter((m) => m.enabled);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader title="الدفع الإلكتروني" subtitle={`طلب رقم ${order.data.orderNumber}`} />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.amountBox}>
          <Text style={styles.amountLabel}>المبلغ المطلوب</Text>
          <Text style={styles.amount}>{amount.toFixed(2)} ج.م</Text>
        </View>

        <View style={styles.infoBanner}>
          <Shield size={18} color={colors.brand.red} />
          <Text style={styles.infoText}>
            الدفع آمن عبر EasyKash. لن نُخزّن بيانات بطاقتك أو محفظتك على سيرفرنا. اختر طريقتك
            المفضلة في الصفحة التالية.
          </Text>
        </View>

        {labelledMethods.length > 0 && (
          <View style={styles.methodsCard}>
            <View style={styles.methodsHead}>
              <CreditCard size={18} color={colors.brand.red} />
              <Text style={styles.methodsTitle}>طرق الدفع المتاحة</Text>
            </View>
            {labelledMethods.map((m) => (
              <View key={m.label} style={styles.methodRow}>
                <CheckCircle2 size={16} color={colors.success} />
                <Text style={styles.methodText}>{m.label}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.infoBanner}>
          <Info size={18} color={colors.brand.red} />
          <Text style={styles.infoText}>
            بعد إتمام الدفع، سيتم تحديث حالة طلبك تلقائياً خلال ثوانٍ. لا تغلق التطبيق.
          </Text>
        </View>

        <GradientButton
          label={checkout.isPending ? 'جاري التحويل…' : 'ادفع الآن'}
          onPress={() => checkout.mutate()}
          loading={checkout.isPending}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  amountBox: {
    backgroundColor: colors.brand.red,
    padding: spacing.lg,
    borderRadius: radii.lg,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  amountLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
  },
  amount: {
    color: colors.white,
    fontFamily: fontFamilies.headingBlack,
    fontSize: 36,
    marginTop: spacing.xs,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand.redLight,
    padding: spacing.md,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
  },
  infoText: {
    flex: 1,
    color: colors.ink,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    lineHeight: 20,
  },
  methodsCard: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  methodsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  methodsTitle: {
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
    fontSize: fontSizes.sm,
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
  },
  methodText: { color: colors.text.primary, fontFamily: fontFamilies.body, fontSize: fontSizes.sm },
  errorBox: {
    margin: spacing.lg,
    backgroundColor: '#FBEAEA',
    padding: spacing.md,
    borderRadius: radii.lg,
    color: colors.danger,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    lineHeight: 20,
    textAlign: 'right',
  },
});
