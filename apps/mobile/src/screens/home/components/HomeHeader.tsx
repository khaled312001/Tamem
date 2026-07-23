/**
 * Home header — a branded gradient band (the red→orange identity) that carries
 * the location, the greeting, the notification bell and the search pill on one
 * cohesive surface, instead of a flat row of controls on the page background.
 *
 * Full-bleed: it pulls out of the ScrollView's horizontal padding with a
 * negative margin so the gradient reaches both screen edges, then rounds its
 * bottom corners. Presentational only — every callback comes from HomeV2Screen.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Bell, ChevronDown, MapPin } from 'lucide-react-native';
import { memo } from 'react';
import { I18nManager, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, gradients, radii, shadows, spacing } from '../../../theme/tokens';
import { HomeSearchBar } from './HomeSearchBar';

const AVATAR = 44;
// RN already lays `flexDirection: 'row'` right-to-left under I18nManager RTL;
// adding 'row-reverse' would flip it a second time. Plain 'row' is correct.
const ROW = 'row' as const;
// A warm cream for the customer's name against the red gradient — the brand
// gold reads as a highlight without fighting the white greeting.
const NAME_GOLD = '#FFE0A3';

interface Props {
  name?: string | null;
  avatarUrl?: string | null;
  locationLabel: string;
  notificationCount?: number;
  greetingOverride?: string | null;
  subtitleOverride?: string | null;
  onPressAvatar: () => void;
  onPressLocation: () => void;
  onPressNotifications: () => void;
  onPressSearch: () => void;
  onPressVoice: () => void;
}

function HomeHeaderBase({
  name,
  avatarUrl,
  locationLabel,
  notificationCount = 0,
  greetingOverride,
  subtitleOverride,
  onPressAvatar,
  onPressLocation,
  onPressNotifications,
  onPressSearch,
  onPressVoice,
}: Props) {
  const firstName = (name ?? '').trim().split(/\s+/)[0] || 'بك';
  const initial = (name ?? 'ت').trim().charAt(0);

  return (
    <LinearGradient
      colors={gradients.brand}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.band}
    >
      <View style={[styles.topRow, { flexDirection: ROW }]}>
        {/* right cluster (RTL): avatar + location chip */}
        <View style={[styles.rightCluster, { flexDirection: ROW }]}>
          <Pressable
            onPress={onPressAvatar}
            style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="حسابي"
            hitSlop={6}
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} resizeMode="cover" />
            ) : (
              <Text style={styles.avatarText}>{initial}</Text>
            )}
          </Pressable>

          <Pressable
            onPress={onPressLocation}
            style={({ pressed }) => [
              styles.locationChip,
              { flexDirection: ROW },
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="تغيير العنوان"
            hitSlop={6}
          >
            <MapPin size={14} color={colors.white} />
            <View style={styles.locationTextCol}>
              <Text style={styles.locationLabel}>التوصيل إلى</Text>
              <View style={[styles.locationValueRow, { flexDirection: ROW }]}>
                <Text style={styles.locationText} numberOfLines={1}>
                  {locationLabel}
                </Text>
                <ChevronDown size={13} color={colors.white} />
              </View>
            </View>
          </Pressable>
        </View>

        {/* left cluster (RTL): bell */}
        <Pressable
          onPress={onPressNotifications}
          style={({ pressed }) => [styles.bellBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="الإشعارات"
          hitSlop={6}
        >
          <Bell size={20} color={colors.white} />
          {notificationCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {notificationCount > 9 ? '9+' : notificationCount}
              </Text>
            </View>
          )}
        </Pressable>
      </View>

      <Text style={styles.greeting} numberOfLines={1}>
        {greetingOverride ? (
          greetingOverride.replace('{name}', firstName)
        ) : (
          <>
            <Text>أهلاً </Text>
            <Text style={styles.greetingName}>{firstName}</Text>
            <Text> 👋</Text>
          </>
        )}
      </Text>
      <Text style={styles.subtitle} numberOfLines={1}>
        {subtitleOverride || 'ماذا تحب تطلب النهاردة؟'}
      </Text>

      <View style={styles.searchWrap}>
        <HomeSearchBar onPress={onPressSearch} onPressVoice={onPressVoice} />
      </View>
    </LinearGradient>
  );
}

export const HomeHeader = memo(HomeHeaderBase);

const styles = StyleSheet.create({
  band: {
    // Escape the ScrollView's horizontal padding so the gradient is full-bleed,
    // and lift under the top inset so it reads as the screen's crown.
    marginHorizontal: -spacing.lg,
    marginTop: -spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    ...shadows.md,
  },
  topRow: { alignItems: 'center', justifyContent: 'space-between' },
  rightCluster: { alignItems: 'center', gap: spacing.sm, flex: 1, minWidth: 0 },

  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: colors.white, fontSize: 18, fontFamily: fontFamilies.bodyExtraBold },

  // Glassy chip on the gradient rather than bare text — reads as a tappable
  // control and stays legible over the red.
  locationChip: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: radii.pill,
    paddingStart: spacing.sm,
    paddingEnd: spacing.md,
    paddingVertical: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  locationTextCol: { minWidth: 0, flexShrink: 1 },
  locationLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.75)',
    fontFamily: fontFamilies.body,
    lineHeight: 14,
    includeFontPadding: false,
    textAlign: 'auto',
  },
  locationValueRow: { alignItems: 'center', gap: 3 },
  locationText: {
    fontSize: 13,
    color: colors.white,
    fontFamily: fontFamilies.bodyExtraBold,
    lineHeight: 19,
    includeFontPadding: false,
    flexShrink: 1,
  },

  bellBtn: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    ...(I18nManager.isRTL ? { right: -2 } : { left: -2 }),
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: colors.brand.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  badgeText: { color: colors.brand.dark, fontSize: 10, fontFamily: fontFamilies.bodyExtraBold },

  greeting: {
    marginTop: spacing.lg,
    fontSize: 24,
    color: colors.white,
    fontFamily: fontFamilies.bodyExtraBold,
    alignSelf: 'stretch',
    textAlign: 'auto',
    lineHeight: 34,
    includeFontPadding: false,
  },
  greetingName: { color: NAME_GOLD },
  subtitle: {
    marginTop: 2,
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    fontFamily: fontFamilies.body,
    alignSelf: 'stretch',
    textAlign: 'auto',
    lineHeight: 21,
    includeFontPadding: false,
  },

  searchWrap: { marginTop: spacing.lg },
  pressed: { opacity: 0.7 },
});
