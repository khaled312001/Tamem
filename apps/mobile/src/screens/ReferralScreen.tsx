import { useQuery } from '@tanstack/react-query';
import { Copy, Gift, Share2 } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/ScreenHeader';
import { EmptyState } from '../components/ui';
import { api } from '../lib/api';
import { copyToClipboard } from '../lib/clipboard';
import { colors, fontFamilies, fontSizes, radii, shadows, spacing } from '../theme/tokens';

type ReferralData = {
  enabled: boolean;
  code?: string;
  shareText?: string;
  stats?: { invited: number; joined: number; credits: number };
};

// «دعوة صديق»: the customer's referral code + share button + a small tally of
// how many friends joined and how many free deliveries they have waiting. The
// reward itself (free delivery) is applied automatically at checkout — this
// screen is just the invite surface.
export function ReferralScreen() {
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery<ReferralData>({
    queryKey: ['me-referral'],
    queryFn: () => api.raw.get('/me/referral').then((r) => r.data.data),
    staleTime: 60_000,
  });

  const code = data?.code ?? '';
  const shareText = data?.shareText ?? '';

  const onCopy = async () => {
    if (!code) return;
    const ok = await copyToClipboard(code);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };
  const onShare = () => {
    if (!shareText) return;
    void Share.share({ message: shareText });
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader title="دعوة صديق" subtitle="ادعُ أصحابك واكسبوا توصيل مجاني سوا" />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand.red} />
        </View>
      ) : !data?.enabled ? (
        <View style={styles.center}>
          <EmptyState
            icon={<Gift size={36} color={colors.brand.red} />}
            title="الميزة مش متاحة دلوقتي"
            subtitle="تابعنا — عروض الدعوة بتفتح من وقت للتاني."
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Hero */}
          <View style={[styles.hero, shadows.sm]}>
            <View style={styles.heroIcon}>
              <Gift size={30} color={colors.white} />
            </View>
            <Text style={styles.heroTitle}>
              ادعُ صحابك، وكل واحد يطلب = توصيلة مجانية ليك وليه 🎉
            </Text>
          </View>

          {/* Code */}
          <Text style={styles.label}>كود الدعوة بتاعك</Text>
          <View style={[styles.codeBox, shadows.sm]}>
            <Text style={styles.code} selectable>
              {code}
            </Text>
            <Pressable
              onPress={onCopy}
              style={({ pressed }) => [styles.copyBtn, pressed && { opacity: 0.85 }]}
              accessibilityLabel="نسخ الكود"
            >
              <Copy size={16} color={colors.brand.red} />
              <Text style={styles.copyText}>{copied ? 'اتنسخ ✓' : 'نسخ'}</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={onShare}
            style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.9 }]}
            accessibilityRole="button"
          >
            <Share2 size={18} color={colors.white} />
            <Text style={styles.shareText}>شارك الكود مع أصحابك</Text>
          </Pressable>

          {/* Stats */}
          <View style={styles.stats}>
            <Stat value={data.stats?.invited ?? 0} label="دعوات" />
            <View style={styles.statDivider} />
            <Stat value={data.stats?.joined ?? 0} label="انضموا وطلبوا" />
            <View style={styles.statDivider} />
            <Stat value={data.stats?.credits ?? 0} label="توصيلات مجانية ليك" highlight />
          </View>

          {/* How it works */}
          <Text style={styles.label}>الطريقة</Text>
          <View style={styles.steps}>
            <Step n={1} text="ابعت كودك لأصحابك." />
            <Step n={2} text="صاحبك يسجّل في التطبيق ويكتب الكود." />
            <Step n={3} text="أول ما يعمل أول طلب من التطبيق…" />
            <Step n={4} text="الاتنين تاخدوا توصيل مجاني على الطلب اللي بعده 🎉" last />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Stat({ value, label, highlight }: { value: number; label: string; highlight?: boolean }) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, highlight && { color: colors.brand.red }]}>
        {value.toLocaleString('ar-EG')}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Step({ n, text, last }: { n: number; text: string; last?: boolean }) {
  return (
    <View style={[styles.step, last && { borderBottomWidth: 0 }]}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.brand.red,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    flex: 1,
    color: colors.white,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.md,
    lineHeight: 24,
  },
  label: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
    color: colors.text.muted,
    marginTop: spacing.sm,
  },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  code: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: 26,
    letterSpacing: 3,
    color: colors.brand.dark,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FDECEA',
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  copyText: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
    color: colors.brand.red,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand.red,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
  },
  shareText: {
    color: colors.white,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.md,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
  },
  statCell: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  statValue: { fontFamily: fontFamilies.bodyExtraBold, fontSize: 22, color: colors.brand.dark },
  statLabel: { fontFamily: fontFamilies.body, fontSize: fontSizes.xs, color: colors.text.muted },
  steps: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FDECEA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
    color: colors.brand.red,
  },
  stepText: {
    flex: 1,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.brand.dark,
    lineHeight: 22,
  },
});
