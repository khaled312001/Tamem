import { Image as ExpoImage, type ImageProps as ExpoImageProps } from 'expo-image';
import type { ImageStyle, StyleProp } from 'react-native';

/**
 * Drop-in replacement for React Native's <Image> for everything that loads over
 * the network.
 *
 * RN's Image re-downloads and re-decodes on Android every time a row scrolls
 * back into view, and pops in with a hard white flash. expo-image keeps a
 * memory + disk cache and cross-fades, so a store list scrolled twice costs one
 * fetch instead of many and the home screen stops flickering.
 *
 * The prop names are deliberately RN's (`resizeMode`, not `contentFit`) so the
 * swap is a one-line import change at every call site and nothing reads
 * differently from the components around it.
 */
export interface CachedImageProps extends Omit<ExpoImageProps, 'contentFit' | 'style'> {
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  style?: StyleProp<ImageStyle>;
  /** Skip the cross-fade — for images that are already on screen at mount. */
  instant?: boolean;
}

const CONTENT_FIT = {
  cover: 'cover',
  contain: 'contain',
  stretch: 'fill',
  center: 'none',
} as const;

export function Image({ resizeMode = 'cover', instant, transition, ...rest }: CachedImageProps) {
  return (
    <ExpoImage
      // RN's names don't all exist in expo-image: `stretch` is `fill`, and
      // `center` (draw at native size, centred) is `none`.
      contentFit={CONTENT_FIT[resizeMode]}
      // Short enough to feel instant, long enough to read as a fade rather than
      // a flash. Bundled (require'd) art decodes immediately, so it opts out.
      transition={transition ?? (instant ? 0 : 180)}
      cachePolicy="memory-disk"
      recyclingKey={
        typeof rest.source === 'object' && rest.source && 'uri' in rest.source
          ? String(rest.source.uri)
          : undefined
      }
      {...rest}
    />
  );
}
