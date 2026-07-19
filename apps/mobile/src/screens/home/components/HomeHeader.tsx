/**
 * Home header: avatar + current location on the right, notification bell on the
 * left, then the greeting block. Presentational only — the address, user and
 * navigation callbacks are passed down from HomeV2Screen.
 */
import { Bell, ChevronDown, MapPin } from 'lucide-react-native';
import { memo } from 'react';
import { I18nManager, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, spacing } from '../../../theme/tokens';

const AVATAR = 46;
// The whole screen is authored right-to-left. Rather than sprinkling
// `row-reverse` per component, each row declares its direction once from the
// single RTL flag, so a future LTR locale flips everything consistently.
// React Native already lays `flexDirection: 'row'` out right-to-left when
// I18nManager RTL is on. Adding 'row-reverse' on top of that flips it a
// SECOND time, back to left-to-right — which is why the header rendered
// mirrored. Plain 'row' is correct on native; the web build gets its
// direction from the document's dir="rtl".
const ROW = 'row' as const;

interface Props {
  /** Display name; only the first word is greeted. */
  name?: string | null;
  /** Profile photo. Falls back to the name's first letter when absent. */
  avatarUrl?: string | null;
  /** Label of the default saved address, if any. */
  locationLabel: string;
  /** Unread notification count — hidden when 0. */
  notificationCount?: number;
  /**
   * Admin overrides from home-config. Both screens used to hardcode the
   * greeting even though صفحة التطبيق offers the field, so setting it did
   * nothing. `{name}` is substituted with the customer's first name.
   */
  greetingOverride?: string | null;
  subtitleOverride?: string | null;
  onPressAvatar: () => void;
  onPressLocation: () => void;
  onPressNotifications: () => void;
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
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} resizeMode="cover" />
            ) : (
              <Text style={styles.avatarText}>{initial}</Text>
            )}
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
        {greetingOverride ? (
          greetingOverride.replace('{name}', firstName)
        ) : (
          <>
            <Text>أهلاً </Text>
            <Text style={styles.greetingName}>{firstName}</Text>
            {/* Trailing in the string so RTL lays it out on the far left, as
                in the design. */}
            <Text> 👋</Text>
          </>
        )}
      </Text>
      <Text style={styles.subtitle} numberOfLines={2}>
        {subtitleOverride || 'ماذا تريد أن تطلب اليوم؟'}
      </Text>
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
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
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

  // Bare icon, no card behind it — the reference has the bell sitting directly
  // on the background.
  bellBtn: {
    width: AVATAR,
    height: AVATAR,
    alignItems: 'center',
    justifyContent: 'center',
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
    // "أهلاً" stays dark; only the customer's name is brand red.
    color: colors.brand.dark,
    fontFamily: fontFamilies.bodyExtraBold,
    // 'auto' (not 'right'): under RTL, React Native flips an explicit 'right'
    // to the left. Letting it align to the writing direction puts Arabic on
    // the right in RTL and would put English on the left in LTR.
    alignSelf: 'stretch',
    textAlign: 'auto',
  },
  greetingName: { color: colors.brand.red },
  subtitle: {
    marginTop: 2,
    fontSize: 15,
    color: colors.brand.gray,
    fontFamily: fontFamilies.body,
    alignSelf: 'stretch',
    textAlign: 'auto',
  },
  pressed: { opacity: 0.7 },
});
