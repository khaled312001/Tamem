/**
 * Renders the media a customer attached to an order — the photos they uploaded
 * (product / prescription / shipment) and the voice recording from a quick
 * order — inside «تفاصيل الطلب». Tapping a photo opens it full-screen; the
 * voice note plays inline.
 */
import { Audio } from 'expo-av';
import { Mic, Pause, Play, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

interface Props {
  imageUrls?: string[] | null;
  audioUri?: string | null;
}

export function OrderMedia({ imageUrls, audioUri }: Props) {
  const images = (imageUrls ?? []).filter((u) => typeof u === 'string' && /^https?:/.test(u));
  const [viewer, setViewer] = useState<string | null>(null);

  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return () => {
      void soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, []);

  const toggleAudio = async () => {
    if (!audioUri) return;
    try {
      if (!soundRef.current) {
        setLoading(true);
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync({ uri: audioUri }, { shouldPlay: true });
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((s) => {
          if (!s.isLoaded) return;
          if (s.didJustFinish) {
            setPlaying(false);
            void sound.setPositionAsync(0);
          }
        });
        setPlaying(true);
        setLoading(false);
        return;
      }
      if (playing) {
        await soundRef.current.pauseAsync();
        setPlaying(false);
      } else {
        await soundRef.current.playFromPositionAsync(0);
        setPlaying(true);
      }
    } catch {
      setLoading(false);
    }
  };

  if (images.length === 0 && !audioUri) return null;

  return (
    <View style={styles.wrap}>
      {audioUri ? (
        <Pressable onPress={toggleAudio} style={styles.audioRow}>
          <View style={styles.audioBtn}>
            {playing ? (
              <Pause size={18} color={colors.white} fill={colors.white} />
            ) : (
              <Play size={18} color={colors.white} fill={colors.white} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.audioTitle}>تسجيل صوتي مرفق</Text>
            <Text style={styles.audioHint}>{loading ? 'جاري التحميل…' : 'اضغط للاستماع'}</Text>
          </View>
          <Mic size={18} color={colors.brand.red} />
        </Pressable>
      ) : null}

      {images.length > 0 ? (
        <View style={styles.imagesRow}>
          {images.map((uri) => (
            <Pressable key={uri} onPress={() => setViewer(uri)} style={styles.thumb}>
              <Image source={{ uri }} style={styles.thumbImg} resizeMode="cover" />
            </Pressable>
          ))}
        </View>
      ) : null}

      <Modal
        visible={!!viewer}
        transparent
        animationType="fade"
        onRequestClose={() => setViewer(null)}
      >
        <View style={styles.viewer}>
          <Pressable style={styles.viewerClose} onPress={() => setViewer(null)} hitSlop={12}>
            <X size={26} color={colors.white} />
          </Pressable>
          {viewer ? (
            <Image source={{ uri: viewer }} style={styles.viewerImg} resizeMode="contain" />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginTop: spacing.sm },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.brand.redLight,
    borderRadius: radii.lg,
    padding: spacing.sm,
  },
  audioBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.brand.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioTitle: { fontFamily: fontFamilies.bodyExtraBold, fontSize: fontSizes.sm, color: colors.ink },
  audioHint: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    marginTop: 2,
  },
  imagesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumb: {
    width: 76,
    height: 76,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.line2,
  },
  thumbImg: { width: '100%', height: '100%' },
  viewer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerClose: { position: 'absolute', top: 48, right: 20, zIndex: 2 },
  viewerImg: { width: '100%', height: '80%' },
});
