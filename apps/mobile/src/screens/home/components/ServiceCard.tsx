/**
 * One of the three headline service cards (دليفري / شحن / تاجر).
 *
 * Equal width is enforced by the parent's `flex: 1` row, so the three cards
 * always match regardless of copy length or screen size.
 */
import { LinearGradient } from 'expo-linear-gradient';
import type { LucideIcon } from 'lucide-react-native';
import { memo } from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';

import { Image } from '../../../components/ui/CachedImage';
import { colors, fontFamilies, shadows, spacing } from '../../../theme/tokens';

interface Props {
  title: string;
  subtitle: string;
  Icon: LucideIcon;
  /** Illustration for this service. Falls back to `Icon` when absent. */
  image?: number;
  /** Admin-uploaded artwork from home settings. Wins over the bundled one, so
   *  the row can be re-skinned without shipping an app update. */
  imageUrl?: string | null;
  /** Card tint. */
  bg: string;
  /** Icon + title colour. */
  fg: string;
  onPress: () => void;
}

function ServiceCardBase({ title, subtitle, Icon, image, imageUrl, bg, fg, onPress }: Props) {
  // The artwork is the illustration; the service NAME is drawn OVER it on a soft
  // bottom gradient so it's always readable and stays editable from the
  // dashboard (upload plain artwork with no baked-in text). Every tile crops to
  // the same aspect ratio, so a wrongly-proportioned upload can't make the row
  // ragged. The old tinted layout stays as a fallback when there's no artwork.
  const art = imageUrl ? { uri: imageUrl } : image ? image : null;
  if (art) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.imageCard, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${title} — ${subtitle}`}
      >
        <Image source={art} style={styles.fullImg} resizeMode="cover" instant={!imageUrl} />
        <LinearGradient
          colors={['transparent', 'rgba(20,10,8,0.15)', 'rgba(20,10,8,0.82)']}
          locations={[0, 0.45, 1]}
          style={styles.scrim}
        />
        <View style={styles.labelWrap}>
          <Text style={styles.label} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
            {title}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: bg }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${title} — ${subtitle}`}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${fg}1F` }]}>
        <Icon size={38} color={fg} strokeWidth={1.7} />
      </View>

      <Text style={[styles.title, { color: fg }]} numberOfLines={2} adjustsFontSizeToFit>
        {title}
      </Text>
      <Text style={styles.subtitle} numberOfLines={1}>
        {subtitle}
      </Text>
    </Pressable>
  );
}

export const ServiceCard = memo(ServiceCardBase);

const styles = StyleSheet.create({
  // Square tile — leaves room for the name band at the bottom without eating the
  // illustration. All three share it, so the row stays even.
  imageCard: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.white,
    ...shadows.sm,
  },
  fullImg: { width: '100%', height: '100%' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%' },
  labelWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 6,
    paddingBottom: 8,
    paddingTop: 4,
  },
  label: {
    color: colors.white,
    fontSize: 12.5,
    lineHeight: 16,
    fontFamily: fontFamilies.bodyExtraBold,
    textAlign: 'center',
    writingDirection: 'rtl',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  card: {
    flex: 1,
    height: 126,
    borderRadius: 16,
    padding: spacing.sm,
    alignItems: I18nManager.isRTL ? 'flex-end' : 'flex-start',
    justifyContent: 'flex-start',
    ...shadows.sm,
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 16,
    fontFamily: fontFamilies.bodyExtraBold,
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  subtitle: {
    marginTop: 1,
    fontSize: 11,
    color: colors.brand.gray,
    fontFamily: fontFamilies.body,
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  pressed: { opacity: 0.85 },
});
