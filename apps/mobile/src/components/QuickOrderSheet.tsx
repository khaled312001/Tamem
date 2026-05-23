import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera, Mic, Pause, Pen, Play, Send, Trash2, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { api } from '../lib/api';
import { openWhatsAppConfirmation } from '../lib/whatsapp';
import { useAuth } from '../stores/auth';
import { colors, fontFamilies, fontSizes, gradients, radii, spacing } from '../theme/tokens';

type Mode = 'menu' | 'text' | 'photo' | 'voice';

interface QuickOrderSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Bottom sheet with 3 instant-order modes:
 * 1. اكتب — textarea + delivery address
 * 2. صورة — image picker + optional caption
 * 3. صوت — voice note recording (max 60s)
 *
 * On submit: POST /orders with category=DELIVERY + customData carrying the input.
 * Backend admin reviews and prices manually.
 */
export function QuickOrderSheet({ visible, onClose }: QuickOrderSheetProps) {
  const [mode, setMode] = useState<Mode>('menu');
  const [submitting, setSubmitting] = useState(false);

  const user = useAuth((s) => s.user);
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 1 : 0,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
    if (!visible) {
      // Reset to menu when closed so the user lands on choices next time
      setTimeout(() => setMode('menu'), 250);
    }
  }, [visible, slide]);

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [600, 0] });
  const opacity = slide.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  async function submitOrder(payload: { notes?: string; imageUrls?: string[]; audioUri?: string }) {
    setSubmitting(true);
    try {
      // Find the supermarket delivery service (fallback default)
      const services = await api.raw.get('/services');
      const fallback =
        services.data.data.find((s: { key: string }) => s.key === 'delivery-supermarket') ??
        services.data.data[0];

      const res = await api.raw.post('/orders', {
        category: 'DELIVERY',
        serviceId: fallback.id,
        deliveryAddress: user?.defaultAddress ?? 'الرجاء تأكيد العنوان مع الإدارة',
        deliveryLat: 26.0297,
        deliveryLng: 32.8146,
        paymentMethod: 'CASH',
        notes: payload.notes,
        imageUrls: payload.imageUrls,
        customData: {
          quickOrder: true,
          mode,
          ...(payload.audioUri ? { audioUri: payload.audioUri } : {}),
        },
      });
      const order = res.data.data;

      if (user) {
        await openWhatsAppConfirmation({
          orderNumber: order.orderNumber,
          serviceNameAr: 'طلب سريع',
          customerName: user.name,
        });
      }

      Alert.alert(
        'تم إرسال طلبك ✓',
        `رقم الطلب: ${order.orderNumber}\nالإدارة هتراجع طلبك وتسعّره.`,
      );
      onClose();
    } catch (err) {
      Alert.alert('خطأ', err instanceof Error ? err.message : 'فشل إرسال الطلب');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>طلب سريع ⚡</Text>
              <Text style={styles.subtitle}>اطلب بأي طريقة تريحك</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={colors.text.muted} />
            </Pressable>
          </View>

          {mode === 'menu' && <ModeMenu onPick={setMode} />}
          {mode === 'text' && (
            <TextMode
              submitting={submitting}
              onBack={() => setMode('menu')}
              onSubmit={(notes) => submitOrder({ notes })}
            />
          )}
          {mode === 'photo' && (
            <PhotoMode
              submitting={submitting}
              onBack={() => setMode('menu')}
              onSubmit={(imageUrls, notes) => submitOrder({ imageUrls, notes })}
            />
          )}
          {mode === 'voice' && (
            <VoiceMode
              submitting={submitting}
              onBack={() => setMode('menu')}
              onSubmit={(audioUri) => submitOrder({ audioUri, notes: 'طلب صوتي — راجع التسجيل' })}
            />
          )}
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

// ============ MODE MENU ============
function ModeMenu({ onPick }: { onPick: (m: Mode) => void }) {
  const options = [
    {
      key: 'text' as const,
      Icon: Pen,
      title: 'اكتب طلبك',
      sub: 'نص بسيط — مثل: 2 كيلو سكر، زيت، تونة',
      colors: gradients.brand,
    },
    {
      key: 'photo' as const,
      Icon: Camera,
      title: 'ارفع صورة',
      sub: 'صور المنتج أو الروشتة',
      colors: gradients.brandGold,
    },
    {
      key: 'voice' as const,
      Icon: Mic,
      title: 'سجّل صوتياً',
      sub: 'تسجيل ملاحظة صوتية حتى 60 ثانية',
      colors: ['#10B981', '#22C55E'] as const,
    },
  ];

  return (
    <View style={styles.menuWrap}>
      {options.map(({ key, Icon, title, sub, colors: grad }) => (
        <Pressable
          key={key}
          onPress={() => onPick(key)}
          style={({ pressed }) => [styles.modeCard, pressed && styles.cardPressed]}
        >
          <LinearGradient
            colors={grad}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.modeIcon}
          >
            <Icon size={26} color={colors.white} />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={styles.modeTitle}>{title}</Text>
            <Text style={styles.modeSub}>{sub}</Text>
          </View>
        </Pressable>
      ))}
      <Text style={styles.helperText}>
        ⓘ الإدارة هتراجع الطلب وتسعّره خلال دقائق، وتبعتلك تأكيد على WhatsApp.
      </Text>
    </View>
  );
}

// ============ TEXT MODE ============
function TextMode({
  submitting,
  onBack,
  onSubmit,
}: {
  submitting: boolean;
  onBack: () => void;
  onSubmit: (notes: string) => void;
}) {
  const [text, setText] = useState('');
  return (
    <View style={styles.modeContent}>
      <Pressable onPress={onBack} style={styles.backLink}>
        <Text style={styles.backText}>← رجوع للخيارات</Text>
      </Pressable>
      <Text style={styles.fieldLabel}>اكتب تفاصيل طلبك</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="مثال:&#10;- 2 كيلو سكر&#10;- زيت ذرة 1 لتر&#10;- 3 علب تونة"
        placeholderTextColor={colors.text.muted}
        multiline
        style={styles.textArea}
        autoFocus
      />
      <SendButton
        disabled={text.trim().length < 3 || submitting}
        loading={submitting}
        onPress={() => onSubmit(text.trim())}
      />
    </View>
  );
}

// ============ PHOTO MODE ============
function PhotoMode({
  submitting,
  onBack,
  onSubmit,
}: {
  submitting: boolean;
  onBack: () => void;
  onSubmit: (imageUrls: string[], notes?: string) => void;
}) {
  const [images, setImages] = useState<string[]>([]);
  const [caption, setCaption] = useState('');

  const pick = async (source: 'camera' | 'library') => {
    const perm =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('لا يوجد إذن', 'فعّل صلاحية الكاميرا/الصور من الإعدادات');
      return;
    }
    const launcher =
      source === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const res = await launcher({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!res.canceled && res.assets?.[0]) {
      setImages((prev) => [...prev, res.assets[0]!.uri]);
    }
  };

  return (
    <View style={styles.modeContent}>
      <Pressable onPress={onBack} style={styles.backLink}>
        <Text style={styles.backText}>← رجوع للخيارات</Text>
      </Pressable>

      <Text style={styles.fieldLabel}>ارفع صورة المنتج أو الروشتة</Text>
      <View style={styles.photoActions}>
        <Pressable onPress={() => pick('camera')} style={styles.photoBtn}>
          <Camera size={20} color={colors.brand.red} />
          <Text style={styles.photoBtnText}>التقط صورة</Text>
        </Pressable>
        <Pressable onPress={() => pick('library')} style={styles.photoBtn}>
          <Camera size={20} color={colors.brand.red} />
          <Text style={styles.photoBtnText}>من المعرض</Text>
        </Pressable>
      </View>

      {images.length > 0 && (
        <View style={styles.thumbsRow}>
          {images.map((uri, idx) => (
            <View key={idx} style={styles.thumb}>
              <Image source={{ uri }} style={styles.thumbImg} />
              <Pressable
                onPress={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                style={styles.thumbRemove}
              >
                <Trash2 size={12} color={colors.white} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <Text style={[styles.fieldLabel, { marginTop: spacing.sm }]}>ملاحظات (اختياري)</Text>
      <TextInput
        value={caption}
        onChangeText={setCaption}
        placeholder="مثال: روشتة بالأدوية المرفقة"
        placeholderTextColor={colors.text.muted}
        style={styles.inputSingle}
      />

      <SendButton
        disabled={images.length === 0 || submitting}
        loading={submitting}
        onPress={() => onSubmit(images, caption.trim() || undefined)}
      />
    </View>
  );
}

// ============ VOICE MODE ============
const MAX_RECORDING_MS = 60_000;

function VoiceMode({
  submitting,
  onBack,
  onSubmit,
}: {
  submitting: boolean;
  onBack: () => void;
  onSubmit: (audioUri: string) => void;
}) {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      sound?.unloadAsync().catch(() => undefined);
      recording?.stopAndUnloadAsync().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('غير متاح على الويب', 'تسجيل الصوت متاح على تطبيق الهاتف فقط.');
      return;
    }
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('لا يوجد إذن', 'فعّل صلاحية الميكروفون');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      setRecording(rec);
      setDuration(0);
      setUri(null);
      tickRef.current = setInterval(() => {
        setDuration((d) => {
          const next = d + 100;
          if (next >= MAX_RECORDING_MS) {
            stopRecording();
            return MAX_RECORDING_MS;
          }
          return next;
        });
      }, 100);
    } catch (err) {
      Alert.alert('خطأ', err instanceof Error ? err.message : 'فشل بدء التسجيل');
    }
  };

  const stopRecording = async () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (!recording) return;
    await recording.stopAndUnloadAsync();
    setUri(recording.getURI());
    setRecording(null);
  };

  const togglePlay = async () => {
    if (!uri) return;
    if (playing && sound) {
      await sound.pauseAsync();
      setPlaying(false);
      return;
    }
    if (sound) {
      await sound.playAsync();
      setPlaying(true);
      return;
    }
    const { sound: newSound } = await Audio.Sound.createAsync({ uri });
    setSound(newSound);
    newSound.setOnPlaybackStatusUpdate((status) => {
      if ('didJustFinish' in status && status.didJustFinish) setPlaying(false);
    });
    await newSound.playAsync();
    setPlaying(true);
  };

  const reset = async () => {
    if (sound) {
      await sound.unloadAsync();
      setSound(null);
    }
    setUri(null);
    setDuration(0);
    setPlaying(false);
  };

  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  return (
    <View style={styles.modeContent}>
      <Pressable onPress={onBack} style={styles.backLink}>
        <Text style={styles.backText}>← رجوع للخيارات</Text>
      </Pressable>

      <View style={styles.voiceCard}>
        <Text style={styles.voiceTimer}>
          {fmt(duration)} {duration > 0 && `/ ${fmt(MAX_RECORDING_MS)}`}
        </Text>

        {recording ? (
          <Pressable onPress={stopRecording} style={[styles.recBtn, styles.recBtnActive]}>
            <View style={styles.recDot} />
            <Text style={styles.recBtnText}>اضغط لإيقاف التسجيل</Text>
          </Pressable>
        ) : uri ? (
          <View style={styles.voiceActions}>
            <Pressable onPress={togglePlay} style={styles.voiceAction}>
              {playing ? (
                <Pause size={22} color={colors.brand.red} />
              ) : (
                <Play size={22} color={colors.brand.red} />
              )}
              <Text style={styles.voiceActionText}>{playing ? 'إيقاف' : 'استمع للتسجيل'}</Text>
            </Pressable>
            <Pressable onPress={reset} style={styles.voiceAction}>
              <Trash2 size={22} color={colors.danger} />
              <Text style={[styles.voiceActionText, { color: colors.danger }]}>إعادة</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={startRecording} style={styles.recBtn}>
            <Mic size={24} color={colors.white} />
            <Text style={styles.recBtnText}>اضغط لبدء التسجيل</Text>
          </Pressable>
        )}

        <Text style={styles.voiceHint}>الحد الأقصى 60 ثانية</Text>
      </View>

      <SendButton
        disabled={!uri || submitting}
        loading={submitting}
        onPress={() => uri && onSubmit(uri)}
      />
    </View>
  );
}

// ============ Shared Send Button ============
function SendButton({
  disabled,
  loading,
  onPress,
}: {
  disabled: boolean;
  loading: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.sendBtn,
        pressed && { opacity: 0.85 },
        disabled && { opacity: 0.4 },
      ]}
    >
      <LinearGradient
        colors={gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.sendInner}
      >
        <Send size={18} color={colors.white} />
        <Text style={styles.sendText}>{loading ? 'جاري الإرسال…' : 'إرسال الطلب'}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '88%',
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 99,
    backgroundColor: colors.line2,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.headingBlack,
    color: colors.ink,
  },
  subtitle: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuWrap: { gap: spacing.sm },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  cardPressed: { backgroundColor: colors.soft, transform: [{ scale: 0.99 }] },
  modeIcon: {
    width: 50,
    height: 50,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTitle: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.headingBold,
    color: colors.ink,
  },
  modeSub: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    marginTop: 2,
    lineHeight: 18,
  },
  helperText: {
    marginTop: spacing.md,
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    textAlign: 'center',
    lineHeight: 18,
  },
  modeContent: { gap: spacing.md },
  backLink: { alignSelf: 'flex-start' },
  backText: {
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
  },
  fieldLabel: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyBold,
    color: colors.text.primary,
  },
  textArea: {
    backgroundColor: colors.soft,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: radii.lg,
    padding: spacing.md,
    minHeight: 130,
    fontSize: fontSizes.md,
    color: colors.text.primary,
    textAlign: 'right',
    fontFamily: fontFamilies.body,
    textAlignVertical: 'top',
  },
  inputSingle: {
    backgroundColor: colors.soft,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: radii.lg,
    padding: spacing.md,
    fontSize: fontSizes.md,
    color: colors.text.primary,
    textAlign: 'right',
    fontFamily: fontFamilies.body,
  },
  photoActions: { flexDirection: 'row', gap: spacing.sm },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand.redLight,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
  },
  photoBtnText: {
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
  },
  thumbsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumb: { width: 80, height: 80, borderRadius: radii.md, position: 'relative' },
  thumbImg: { width: '100%', height: '100%', borderRadius: radii.md },
  thumbRemove: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceCard: {
    backgroundColor: colors.soft,
    borderRadius: radii.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  voiceTimer: {
    fontSize: 28,
    fontFamily: fontFamilies.headingBold,
    color: colors.ink,
    letterSpacing: 2,
  },
  recBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand.red,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    minWidth: 240,
    justifyContent: 'center',
  },
  recBtnActive: { backgroundColor: colors.danger },
  recDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.white,
  },
  recBtnText: {
    color: colors.white,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
  },
  voiceActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  voiceAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.white,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line2,
  },
  voiceActionText: {
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
  },
  voiceHint: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
  },
  sendBtn: { borderRadius: radii.lg, overflow: 'hidden' },
  sendInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  sendText: {
    color: colors.white,
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.md,
  },
});
