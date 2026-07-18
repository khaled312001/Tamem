/**
 * Home header: avatar + current location on the right, notification bell on the
 * left, then the greeting block. Presentational only — the address, user and
 * navigation callbacks are passed down from HomeV2Screen.
 */
import { Bell, ChevronDown, MapPin } from 'lucide-react-native';
import { memo } from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, radii, shadows, spacing } from '../../../theme/tokens';

const AVATAR = 46;
// The whole screen is authored right-to-left. Rather than sprinkling
// `row-reverse` per component, each row declares its direction once from the
// single RTL flag, so a future LTR locale flips everything consistently.
const ROW = I18nManager.isRTL ? 'row-reverse' : ('row' as const);

interface Props {
  /** Display name; only the first word is greeted. */
  name?: string | null;
  /** Label of the default saved address, if any. */
  locationLabel: string;
  /** Unread notification count — hidden when 0. */
  notificationCount?: number;
  onPressAvatar: () => void;
  onPressLocation: () => void;
  onPressNotifications: () => void;
}

function HomeHeaderBase({
  name,
  locationLabel,
  notificationCount = 0,
  onPressAvatar,
  onPressLocation,
  onPressNotifications,
}: Props) {
  const firstName = (name ?? '').trim().split(/\s+/)[0] || 'بك';
  const initial = (name ?? 'ت').trim().charAt(0);

  return (
    <View style={styles.wrap}>
      <View style={[styles.topRow, { flexDirection: ROW }]}>
        {/* right cluster (RTL): avatar + location */}
        <View style={[styles.rightCluster, { flexDirection: ROW }]}>
          <Pressable
            onPress={onPressAvatar}
            style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="حسابي"
            hitSlop={6}
          >
            <Text style={styles.avatarText}>{initial}</Text>
            <View style={styles.avatarDot} />
          </Pressable>

          <Pressable
            onPress={onPressLocation}
            style={({ pressed }) => [
              styles.locationRow,
              { flexDirection: ROW },
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="تغيير العنوان"
            hitSlop={6}
          >
            <MapPin size={15} color={colors.brand.red} />
            <Text style={styles.locationText} numberOfLines={1}>
              {locationLabel}
            </Text>
            <ChevronDown size={14} color={colors.brand.gray} />
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
          <Bell size={22} color={colors.brand.dark} />
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
        <Text>👋 </Text>
        <Text>أهلاً </Text>
        <Text style={styles.greetingName}>{firstName}</Text>
      </Text>
      <Text style={styles.subtitle}>ماذا تريد أن تطلب اليوم؟</Text>
    </View>
  );
}

export const HomeHeader = memo(HomeHeaderBase);

const styles = StyleSheet.create({
  wrap: { paddingTop: spacing.sm },
  topRow: { alignItems: 'center', justifyContent: 'space-between' },
  rightCluster: { alignItems: 'center', gap: spacing.sm },

  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: colors.brand.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.white,
    fontSize: 19,
    fontFamily: fontFamilies.bodyExtraBold,
  },
  avatarDot: {
    position: 'absolute',
    top: 1,
    // Sits on the outer edge in both directions.
    ...(I18nManager.isRTL ? { left: 1 } : { right: 1 }),
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: colors.brand.red,
    borderWidth: 2,
    borderColor: colors.white,
  },

  locationRow: { alignItems: 'center', gap: 4, maxWidth: 190 },
  locationText: {
    fontSize: 13,
    color: colors.brand.gray,
    fontFamily: fontFamilies.bodyBold,
  },

  bellBtn: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#EFE7E2',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  badge: {
    position: 'absolute',
    top: -4,
    ...(I18nManager.isRTL ? { right: -4 } : { left: -4 }),
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: colors.brand.red,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  badgeText: {
    color: colors.white,
    fontSize: 10,
    fontFamily: fontFamilies.bodyExtraBold,
  },

  greeting: {
    marginTop: spacing.lg,
    fontSize: 26,
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyExtraBold,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  greetingName: { color: colors.brand.red },
  subtitle: {
    marginTop: 2,
    fontSize: 15,
    color: colors.brand.gray,
    fontFamily: fontFamilies.body,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  pressed: { opacity: 0.7 },
});
