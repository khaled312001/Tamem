import {
  Image,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, palette, sizes } from '../../theme/tokens';

/**
 * Avatar — circular image with name-initial fallback. Color is derived
 * deterministically from the name so the same person always gets the same
 * tile color across screens.
 */
export interface AvatarProps {
  name?: string;
  source?: ImageSourcePropType;
  uri?: string | null;
  size?: keyof typeof sizes.avatar;
  style?: StyleProp<ViewStyle>;
}

const PALETTE = [
  palette.red[300],
  palette.orange[400],
  palette.gold[400],
  palette.green[400],
  palette.blue[400],
] as const;

export function Avatar({ name = '', source, uri, size = 'md', style }: AvatarProps) {
  const dim = sizes.avatar[size];
  const initials = getInitials(name);
  const tint = PALETTE[hashName(name) % PALETTE.length] ?? palette.red[300];

  if (source) {
    const imageStyle: ImageStyle = {
      width: dim,
      height: dim,
      borderRadius: dim / 2,
      backgroundColor: tint,
    };
    return <Image source={source} style={[imageStyle, style as StyleProp<ImageStyle>]} />;
  }
  if (uri) {
    const imageStyle: ImageStyle = {
      width: dim,
      height: dim,
      borderRadius: dim / 2,
      backgroundColor: tint,
    };
    return <Image source={{ uri }} style={[imageStyle, style as StyleProp<ImageStyle>]} />;
  }

  const viewStyle: ViewStyle = {
    width: dim,
    height: dim,
    borderRadius: dim / 2,
    backgroundColor: tint,
  };
  return (
    <View style={[styles.fallback, viewStyle, style]}>
      <Text style={[styles.initials, { fontSize: Math.round(dim * 0.42), color: colors.white }]}>
        {initials || '?'}
      </Text>
    </View>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0];
  if (!first) return '';
  if (parts.length === 1) return first.slice(0, 1);
  const second = parts[1];
  return first.charAt(0) + (second ? second.charAt(0) : '');
}

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: 'Cairo_800ExtraBold',
    includeFontPadding: false,
    textAlign: 'center',
  },
});
