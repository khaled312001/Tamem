/**
 * One of the three headline service cards (دليفري / شحن / تاجر).
 *
 * Equal width is enforced by the parent's `flex: 1` row, so the three cards
 * always match regardless of copy length or screen size.
 */
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
  // The artwork IS the whole card — the title + subtitle are baked into the
  // image — so it fills the tile and no separate text is drawn. The old tinted
  // layout stays as a fallback for when there is no artwork at all.
  //
  // The tile keeps its own aspect ratio and crops to it. That is deliberate:
  // the three cards must stay the same size as each other whatever the admin
  // uploads, so a wrongly-proportioned upload can never make the row ragged.
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

      <Text style={[styles.title, { color: fg }]} numberOfLines={1}>
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
  // Full-image tile — slightly wider than tall so the boxes read smaller;
  // the square artwork keeps a small safe margin so this crop is invisible.
  imageCard: {
    flex: 1,
    aspectRatio: 1.12,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.white,
    ...shadows.sm,
  },
  fullImg: { width: '100%', height: '100%' },

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
