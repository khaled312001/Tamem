import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Camera,
  ChevronLeft,
  Image as ImageIcon,
  Mic,
  Minus,
  Pause,
  Pen,
  Play,
  Plus,
  Send,
  ShoppingBag,
  Store,
  Trash2,
  X,
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { createRecorder, formatDuration, type Recorder } from '../lib/audioRecorder';
import { api } from '../lib/api';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { showToast } from '../lib/toast';
import { uploadFile } from '../lib/uploadFile';
import { colors, fontFamilies, fontSizes, gradients, radii, spacing } from '../theme/tokens';

import { CouponInput } from './CouponInput';

type Mode = 'menu' | 'text' | 'photo' | 'voice' | 'products';

interface CatalogProduct {
  id: string;
  nameAr: string;
  price: number | string;
  imageUrl?: string | null;
  merchant?: { id: string; storeNameAr: string; isOpen: boolean };
  category?: { id: string; nameAr: string };
}

interface AppliedCoupon {
  code: string;
  discount: number;
  finalAmount: number;
}

interface QuickOrderSheetProps {
  visible: boolean;
  onClose: () => void;
  /**
   * Which mode to land on when opened. Defaults to the menu. The home search
   * bar's mic passes 'voice' so tapping it starts recording immediately
   * instead of making the customer pick from the menu first.
   */
  initialMode?: Mode;
}

/**
 * Bottom sheet with 3 instant-order modes:
 * 1. اكتب — textarea + delivery address
 * 2. صورة — image picker + optional caption
 * 3. صوت — voice note (works on web via MediaRecorder, native via expo-av)
 *
 * Submits silently to POST /orders with category=DELIVERY + customData.
 * Then navigates to OrderTracking — no WhatsApp prompt.
 */
export function QuickOrderSheet({ visible, onClose, initialMode }: QuickOrderSheetProps) {
  const navigation = useNavigation<{
    getParent: () => { navigate: (...a: unknown[]) => void } | undefined;
  }>();
  const [mode, setMode] = useState<Mode>(initialMode ?? 'menu');
  const [submitting, setSubmitting] = useState(false);
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);

  // Reset coupon when sheet closes so a previous session's code doesn't carry
  // over silently.
  useEffect(() => {
    if (!visible) setCoupon(null);
  }, [visible]);

  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 1 : 0,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
    if (visible) {
      // Re-assert on each open: the sheet is kept mounted, so without this a
      // previous session's mode would persist.
      if (initialMode) setMode(initialMode);
      return undefined;
    }
    // Cleared on re-run/unmount: rapid open/close used to stack these timers,
    // each firing setMode on a possibly-unmounted sheet.
    const t = setTimeout(() => setMode(initialMode ?? 'menu'), 250);
    return () => clearTimeout(t);
  }, [visible, slide, initialMode]);

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [600, 0] });
  const opacity = slide.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  async function submitOrder(payload: {
    notes?: string;
    imageUrls?: string[];
    audioUri?: string;
    audioMime?: string;
    audioDurationMs?: number;
    productLines?: { productId: string; nameAr: string; quantity: number; price: number }[];
  }) {
    setSubmitting(true);
    try {
      // Upload images / audio first — if any upload returns a non-hosted URL
      // (uploaded:false), fail loud so we never send file:// to the dispatcher.
      let hostedImages: string[] | undefined;
      if (payload.imageUrls && payload.imageUrls.length > 0) {
        const results = await Promise.all(
          payload.imageUrls.map((u) => uploadFile(u, { mime: 'image/jpeg' })),
        );
        const failed = results.filter((r) => !r?.url || !/^https?:/.test(r.url));
        if (failed.length > 0) {
          showToast({
            title: `فشل رفع ${failed.length} صورة`,
            message: 'تأكد من اتصالك بالإنترنت وأعد المحاولة',
            tone: 'error',
          });
          return;
        }
        hostedImages = results.map((r) => r.url);
      }
      let hostedAudio = payload.audioUri;
      if (payload.audioUri) {
        const r = await uploadFile(payload.audioUri, {
          mime: payload.audioMime ?? 'audio/webm',
          name: `voice-${Date.now()}.${(payload.audioMime ?? 'audio/webm').split('/')[1]}`,
        });
        if (!r?.url || !/^https?:/.test(r.url)) {
          showToast({
            title: 'تعذّر رفع التسجيل الصوتي',
            message: 'حاول تاني أو ابعت طلب نصي بدلاً منه',
            tone: 'error',
          });
          return;
        }
        hostedAudio = r.url;
      }

      const services = await api.raw.get('/services');
      const list = services.data.data as { id: string; key: string; category: string }[];
      const fallback =
        list.find((s) => s.key === 'delivery-supermarket') ??
        list.find((s) => s.category === 'DELIVERY') ??
        list[0];

      if (!fallback) {
        showToast({ title: 'لا توجد خدمات متاحة حالياً', tone: 'error' });
        return;
      }

      const productsNotes =
        payload.productLines && payload.productLines.length > 0
          ? payload.productLines
              .map((l) => `• ${l.quantity}× ${l.nameAr} (${l.price.toLocaleString('ar-EG')} ج.م)`)
              .join('\n')
          : null;

      const finalNotes = [payload.notes, productsNotes].filter(Boolean).join('\n\n') || undefined;

      // Resolve the customer's default delivery address from their saved
      // book. Previously we shipped the order with the placeholder
      // "الرجاء تأكيد العنوان مع الإدارة" + Qift coordinates, which forced
      // the admin to chase the customer for the real address.
      let addressLine: string | null = null;
      let addressLat: number | null = null;
      let addressLng: number | null = null;
      let addrCityId: string | null = null;
      let addrVillageId: string | null = null;
      let addrAreaId: string | null = null;
      try {
        const addrRes = await api.raw.get('/me/addresses');
        const list = (addrRes.data?.data ?? []) as Array<{
          address: string;
          lat?: number | string | null;
          lng?: number | string | null;
          isDefault?: boolean;
          cityId?: string | null;
          villageId?: string | null;
          areaId?: string | null;
        }>;
        const chosen = list.find((a) => a.isDefault) ?? list[0];
        if (chosen) {
          addressLine = chosen.address;
          if (chosen.lat != null) addressLat = Number(chosen.lat);
          if (chosen.lng != null) addressLng = Number(chosen.lng);
          addrCityId = chosen.cityId ?? null;
          addrVillageId = chosen.villageId ?? null;
          addrAreaId = chosen.areaId ?? null;
        }
      } catch {
        // /me/addresses may be empty or fail — handled below.
      }
      // A saved address with a zone (city/village/area) is deliverable even
      // without a GPS pin — the zone prices and routes it. Only block when there
      // is neither an address nor any way to locate it.
      const hasZone = !!(addrCityId || addrVillageId || addrAreaId);
      const hasPin = addressLat != null && addressLng != null;
      if (!addressLine || (!hasZone && !hasPin)) {
        showToast({
          title: 'مفيش عنوان توصيل محفوظ',
          message: 'أضف عنوان من صفحة "حسابي" قبل إرسال الطلب السريع.',
          tone: 'error',
        });
        return;
      }

      const res = await api.raw.post('/orders', {
        category: 'DELIVERY',
        serviceId: fallback.id,
        deliveryAddress: addressLine,
        deliveryLat: addressLat,
        deliveryLng: addressLng,
        // Forward the zone so the backend prices + routes a pin-less address.
        cityId: addrCityId ?? undefined,
        villageId: addrVillageId ?? undefined,
        areaId: addrAreaId ?? undefined,
        paymentMethod: 'CASH',
        notes: finalNotes,
        imageUrls: hostedImages,
        ...(coupon ? { couponCode: coupon.code } : {}),
        customData: {
          quickOrder: true,
          mode,
          ...(hostedAudio
            ? {
                audioUri: hostedAudio,
                audioMime: payload.audioMime,
                audioDurationMs: payload.audioDurationMs,
              }
            : {}),
          ...(payload.productLines && payload.productLines.length > 0
            ? { selectedProducts: payload.productLines }
            : {}),
        },
      });
      const order = res.data.data;

      onClose();
      try {
        const parent = navigation.getParent?.();
        // Land on live tracking — was OrdersList before.
        parent?.navigate('Orders', {
          screen: 'OrderTracking',
          params: { orderId: order.id, justCreated: true },
        });
      } catch {
        /* ignore */
      }
      showToast({
        title: 'تم استلام طلبك',
        message: `رقم الطلب: #${order.orderNumber ?? '—'}`,
        tone: 'success',
      });
    } catch (err) {
      showToast({
        title: 'تعذّر إرسال الطلب',
        message: err instanceof Error ? err.message : 'حصلت مشكلة',
        tone: 'error',
      });
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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ maxHeight: '100%' }}
        >
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>اطلب أي حاجة </Text>
              <Text style={styles.subtitle}>
                {mode === 'menu'
                  ? 'اكتبها، صوّرها، أو قولها بصوتك — واحنا نجيبهالك'
                  : 'املأ التفاصيل وأرسل خلال ثواني'}
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <X size={20} color={colors.text.muted} />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollPad}
          >
            {mode === 'menu' && <ModeMenu onPick={setMode} />}
            {mode === 'text' && (
              <TextMode
                submitting={submitting}
                coupon={coupon}
                onCouponApplied={(c) =>
                  setCoupon({ code: c.code, discount: c.discount, finalAmount: c.finalAmount })
                }
                onCouponCleared={() => setCoupon(null)}
                onBack={() => setMode('menu')}
                onSubmit={(notes) => submitOrder({ notes })}
              />
            )}
            {mode === 'photo' && (
              <PhotoMode
                submitting={submitting}
                coupon={coupon}
                onCouponApplied={(c) =>
                  setCoupon({ code: c.code, discount: c.discount, finalAmount: c.finalAmount })
                }
                onCouponCleared={() => setCoupon(null)}
                onBack={() => setMode('menu')}
                onSubmit={(imageUrls, notes) => submitOrder({ imageUrls, notes })}
              />
            )}
            {mode === 'voice' && (
              <VoiceMode
                submitting={submitting}
                coupon={coupon}
                onCouponApplied={(c) =>
                  setCoupon({ code: c.code, discount: c.discount, finalAmount: c.finalAmount })
                }
                onCouponCleared={() => setCoupon(null)}
                onBack={() => setMode('menu')}
                onSubmit={(uri, mime, durationMs) =>
                  submitOrder({
                    audioUri: uri,
                    audioMime: mime,
                    audioDurationMs: durationMs,
                    notes: 'طلب صوتي — راجع التسجيل المرفق',
                  })
                }
              />
            )}
            {mode === 'products' && (
              <ProductsMode
                submitting={submitting}
                coupon={coupon}
                onCouponApplied={(c) =>
                  setCoupon({ code: c.code, discount: c.discount, finalAmount: c.finalAmount })
                }
                onCouponCleared={() => setCoupon(null)}
                onBack={() => setMode('menu')}
                onSubmit={(lines, notes) => submitOrder({ productLines: lines, notes })}
              />
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

// ============ MODE MENU ============
function ModeMenu({ onPick }: { onPick: (m: Mode) => void }) {
  const options = [
    {
      key: 'products' as const,
      Icon: ShoppingBag,
      title: 'تصفّح المنتجات',
      sub: 'اختر من المنتجات المتاحة في المتاجر',
      colors: gradients.brand,
    },
    {
      key: 'text' as const,
      Icon: Pen,
      title: 'اكتب طلبك',
      sub: 'مثال: 2 كيلو سكر، زيت، تونة',
      colors: gradients.brandGold,
    },
    {
      key: 'photo' as const,
      Icon: Camera,
      title: 'ارفع صورة',
      sub: 'روشتة، قائمة مكتوبة، أو صورة منتج',
      colors: ['#0EA5E9', '#3B82F6'] as const,
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
            <Icon size={24} color={colors.white} />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={styles.modeTitle}>{title}</Text>
            <Text style={styles.modeSub}>{sub}</Text>
          </View>
          <ChevronLeft size={18} color={colors.text.muted} />
        </Pressable>
      ))}
      <Text style={styles.helperText}>
        ⓘ الإدارة بتراجع الطلب وتسعّره خلال دقائق ثم تتواصل معاك للتأكيد.
      </Text>
    </View>
  );
}

interface ModeProps {
  submitting: boolean;
  coupon: AppliedCoupon | null;
  onCouponApplied: (c: { code: string; discount: number; finalAmount: number }) => void;
  onCouponCleared: () => void;
  onBack: () => void;
}

// ============ TEXT MODE ============
function TextMode({
  submitting,
  coupon,
  onCouponApplied,
  onCouponCleared,
  onBack,
  onSubmit,
}: ModeProps & { onSubmit: (notes: string) => void }) {
  const [text, setText] = useState('');
  return (
    <View style={styles.modeContent}>
      <BackLink onPress={onBack} />
      <Text style={styles.fieldLabel}>اكتب تفاصيل طلبك</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="اكتب أي طلب من أي محل:&#10;- 2 كيلو سكر + زيت (سوبر ماركت)&#10;- علبة بنادول (صيدلية)&#10;- وجبة فراخ + بيبسي (مطعم)"
        placeholderTextColor={colors.text.muted}
        multiline
        style={styles.textArea}
        autoFocus
      />
      <CouponBlock coupon={coupon} onApplied={onCouponApplied} onCleared={onCouponCleared} />
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
  coupon,
  onCouponApplied,
  onCouponCleared,
  onBack,
  onSubmit,
}: ModeProps & { onSubmit: (imageUrls: string[], notes?: string) => void }) {
  const [images, setImages] = useState<string[]>([]);
  const [caption, setCaption] = useState('');

  const pick = async (source: 'camera' | 'library') => {
    const perm =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast({
        title: 'لا يوجد إذن',
        message: 'فعّل صلاحية الكاميرا/الصور من الإعدادات',
        tone: 'error',
      });
      return;
    }
    const launcher =
      source === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const res = await launcher({
      // SDK 52 accepts string-array form; the enum form is deprecated.
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (!res.canceled && res.assets?.[0]) {
      setImages((prev) => [...prev, res.assets[0]!.uri]);
    }
  };

  return (
    <View style={styles.modeContent}>
      <BackLink onPress={onBack} />

      <Text style={styles.fieldLabel}>ارفع صورة المنتج أو الروشتة</Text>
      <View style={styles.photoActions}>
        <Pressable onPress={() => pick('camera')} style={styles.photoBtn}>
          <Camera size={20} color={colors.brand.red} />
          <Text style={styles.photoBtnText}>التقط صورة</Text>
        </Pressable>
        <Pressable onPress={() => pick('library')} style={styles.photoBtn}>
          <ImageIcon size={20} color={colors.brand.red} />
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
        placeholder="أضف تفاصيل إن حابب: نوع، كمية، أو ملاحظة"
        placeholderTextColor={colors.text.muted}
        style={styles.inputSingle}
      />

      <CouponBlock coupon={coupon} onApplied={onCouponApplied} onCleared={onCouponCleared} />

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
  coupon,
  onCouponApplied,
  onCouponCleared,
  onBack,
  onSubmit,
}: ModeProps & { onSubmit: (uri: string, mime: string, durationMs: number) => void }) {
  const recorderRef = useRef<Recorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [done, setDone] = useState<{ uri: string; mime: string; durationMs: number } | null>(null);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const soundRef = useRef<unknown>(null);

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      recorderRef.current?.cancel().catch(() => undefined);
      audioElRef.current?.pause();
      audioElRef.current = null;
    };
  }, []);

  const startRecording = async () => {
    try {
      const rec = createRecorder();
      await rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setDuration(0);
      setDone(null);
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
      showToast({
        title: 'تعذّر التسجيل',
        message: err instanceof Error ? err.message : 'حدث خطأ',
        tone: 'error',
      });
    }
  };

  const stopRecording = async () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    const rec = recorderRef.current;
    if (!rec) return;
    try {
      const result = await rec.stop();
      setDone(result);
    } catch (err) {
      showToast({
        title: 'خطأ',
        message: err instanceof Error ? err.message : 'فشل إيقاف التسجيل',
        tone: 'error',
      });
    } finally {
      recorderRef.current = null;
      setRecording(false);
    }
  };

  const togglePlay = async () => {
    if (!done) return;
    if (Platform.OS === 'web') {
      if (!audioElRef.current) {
        audioElRef.current = new Audio(done.uri);
        audioElRef.current.onended = () => setPlaying(false);
      }
      if (playing) {
        audioElRef.current.pause();
        setPlaying(false);
      } else {
        await audioElRef.current.play();
        setPlaying(true);
      }
      return;
    }
    // Native: use expo-av Sound
    const { Audio: AudioModule } = await import('expo-av');
    if (playing && soundRef.current) {
      const s = soundRef.current as { pauseAsync: () => Promise<void> };
      await s.pauseAsync();
      setPlaying(false);
      return;
    }
    if (soundRef.current) {
      const s = soundRef.current as { playAsync: () => Promise<void> };
      await s.playAsync();
      setPlaying(true);
      return;
    }
    const { sound } = await AudioModule.Sound.createAsync({ uri: done.uri });
    soundRef.current = sound;
    sound.setOnPlaybackStatusUpdate((status) => {
      if ('didJustFinish' in status && status.didJustFinish) setPlaying(false);
    });
    await sound.playAsync();
    setPlaying(true);
  };

  const reset = async () => {
    if (Platform.OS === 'web' && audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
    } else if (soundRef.current) {
      const s = soundRef.current as { unloadAsync: () => Promise<void> };
      await s.unloadAsync().catch(() => undefined);
      soundRef.current = null;
    }
    setDone(null);
    setDuration(0);
    setPlaying(false);
  };

  return (
    <View style={styles.modeContent}>
      <BackLink onPress={onBack} />

      <View style={styles.voiceCard}>
        <Text style={styles.voiceTimer}>
          {formatDuration(duration)} {duration > 0 && `/ ${formatDuration(MAX_RECORDING_MS)}`}
        </Text>

        {recording ? (
          <Pressable onPress={stopRecording} style={[styles.recBtn, styles.recBtnActive]}>
            <View style={styles.recDot} />
            <Text style={styles.recBtnText}>اضغط لإيقاف التسجيل</Text>
          </Pressable>
        ) : done ? (
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

      <CouponBlock coupon={coupon} onApplied={onCouponApplied} onCleared={onCouponCleared} />

      <SendButton
        disabled={!done || submitting}
        loading={submitting}
        onPress={() => done && onSubmit(done.uri, done.mime, done.durationMs)}
      />
    </View>
  );
}

// ============ PRODUCTS MODE ============
function ProductsMode({
  submitting,
  coupon,
  onCouponApplied,
  onCouponCleared,
  onBack,
  onSubmit,
}: ModeProps & {
  onSubmit: (
    lines: { productId: string; nameAr: string; quantity: number; price: number }[],
    notes?: string,
  ) => void;
}) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');

  // Search on the server. `/products` returns one page (20 by default), so the
  // old client-side `.filter()` was only ever searching that first page — a
  // product that existed but sat on page 2 returned "no results".
  const debouncedSearch = useDebouncedValue(search, 300);

  const { data, isLoading } = useQuery<CatalogProduct[]>({
    queryKey: ['catalog-products', debouncedSearch],
    queryFn: () => {
      // Matches what the list renders — asking for more than we show would
      // silently drop results the user searched for.
      const params: Record<string, string | number> = { pageSize: 30 };
      const q = debouncedSearch.trim();
      if (q) params.search = q;
      return api.raw.get('/products', { params }).then((r) => r.data.data);
    },
    staleTime: 60_000,
    // Keep the current rows on screen while the next search lands.
    placeholderData: (prev) => prev,
  });

  /**
   * Every product the sheet has ever shown, by id.
   *
   * The cart holds ids, and the price/label for a line is looked up here rather
   * than in `data`. That matters now that `data` changes with the search term:
   * add an item, search for something else, and it would otherwise vanish from
   * `data` — silently pricing that line at zero.
   */
  const seenRef = useRef<Map<string, CatalogProduct>>(new Map());
  if (data) for (const p of data) seenRef.current.set(p.id, p);
  const seen = seenRef.current;

  const filtered = data ?? [];

  const totalItems = useMemo(() => Object.values(cart).reduce((s, q) => s + q, 0), [cart]);

  const totalPrice = useMemo(
    () =>
      Object.entries(cart).reduce((sum, [id, qty]) => {
        const p = seen.get(id);
        return sum + (p ? Number(p.price) * qty : 0);
      }, 0),
    [cart, seen],
  );

  const lines = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, q]) => q > 0)
        .map(([id, q]) => {
          const p = seen.get(id);
          return {
            productId: id,
            nameAr: p?.nameAr ?? '',
            quantity: q,
            price: Number(p?.price ?? 0),
          };
        }),
    [cart, seen],
  );

  const inc = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  const dec = (id: string) =>
    setCart((c) => {
      const next = (c[id] ?? 0) - 1;
      const copy = { ...c };
      if (next <= 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });

  return (
    <View style={styles.modeContent}>
      <BackLink onPress={onBack} />

      <View style={styles.searchBox}>
        <ShoppingBag size={16} color={colors.text.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="ابحث عن منتج أو متجر…"
          placeholderTextColor={colors.text.muted}
          style={styles.searchInput}
        />
      </View>

      {isLoading ? (
        <Text style={styles.productsHint}>جاري تحميل المنتجات…</Text>
      ) : filtered.length === 0 ? (
        <View style={styles.productsEmpty}>
          <ShoppingBag size={28} color={colors.text.muted} />
          <Text style={styles.productsEmptyText}>
            {search ? 'لا توجد منتجات تطابق بحثك' : 'لا توجد منتجات متاحة الآن'}
          </Text>
        </View>
      ) : (
        <View style={styles.productsList}>
          {filtered.map((p) => {
            const qty = cart[p.id] ?? 0;
            return (
              <View key={p.id} style={styles.productRow}>
                <View style={styles.productThumb}>
                  {p.imageUrl ? (
                    <Image source={{ uri: p.imageUrl }} style={{ width: '100%', height: '100%' }} />
                  ) : (
                    <Store size={20} color={colors.brand.red} />
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.productName} numberOfLines={1}>
                    {p.nameAr}
                  </Text>
                  <Text style={styles.productMerchant} numberOfLines={1}>
                    {p.merchant?.storeNameAr ?? '—'}
                  </Text>
                  <Text style={styles.productPrice}>
                    {Number(p.price).toLocaleString('ar-EG')} ج.م
                  </Text>
                </View>
                {qty === 0 ? (
                  <Pressable
                    onPress={() => inc(p.id)}
                    style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
                  >
                    <Plus size={14} color={colors.white} />
                    <Text style={styles.addBtnText}>أضف</Text>
                  </Pressable>
                ) : (
                  <View style={styles.qtyRow}>
                    <Pressable onPress={() => dec(p.id)} style={styles.qtyBtn} hitSlop={6}>
                      <Minus size={14} color={colors.brand.red} />
                    </Pressable>
                    <Text style={styles.qtyText}>{qty}</Text>
                    <Pressable onPress={() => inc(p.id)} style={styles.qtyBtn} hitSlop={6}>
                      <Plus size={14} color={colors.brand.red} />
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {totalItems > 0 ? (
        <View style={styles.cartSummary}>
          <Text style={styles.cartSummaryLabel}>{totalItems} منتج · إجمالي تقديري</Text>
          <Text style={styles.cartSummaryPrice}>{totalPrice.toLocaleString('ar-EG')} ج.م</Text>
        </View>
      ) : null}

      <Text style={[styles.fieldLabel, { marginTop: spacing.sm }]}>ملاحظات إضافية (اختياري)</Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="مثلاً: نوع معيّن، حساسية، أو وصف إضافي"
        placeholderTextColor={colors.text.muted}
        style={styles.inputSingle}
      />

      <CouponBlock coupon={coupon} onApplied={onCouponApplied} onCleared={onCouponCleared} />

      <SendButton
        disabled={totalItems === 0 || submitting}
        loading={submitting}
        onPress={() => onSubmit(lines, notes.trim() || undefined)}
      />
    </View>
  );
}

// ============ Shared Helpers ============
function BackLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.backLink} hitSlop={8}>
      <ChevronLeft size={14} color={colors.brand.red} />
      <Text style={styles.backText}>رجوع للخيارات</Text>
    </Pressable>
  );
}

function CouponBlock({
  coupon,
  onApplied,
  onCleared,
}: {
  coupon: AppliedCoupon | null;
  onApplied: (c: { code: string; discount: number; finalAmount: number }) => void;
  onCleared: () => void;
}) {
  return (
    <View style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>
      <Text style={styles.fieldLabel}>كوبون الخصم</Text>
      <CouponInput
        orderAmount={coupon?.finalAmount ?? 0}
        onApplied={(code, discount, finalAmount) => onApplied({ code, discount, finalAmount })}
        onCleared={onCleared}
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
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  title: { fontSize: fontSizes.lg, fontFamily: fontFamilies.headingBlack, color: colors.ink },
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
  modeTitle: { fontSize: fontSizes.md, fontFamily: fontFamilies.headingBold, color: colors.ink },
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
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    marginBottom: spacing.sm,
  },
  backText: {
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xs,
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
    end: 4,
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
  recDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.white },
  recBtnText: {
    color: colors.white,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
  },
  voiceActions: { flexDirection: 'row', gap: spacing.md },
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
  scrollPad: {
    paddingBottom: spacing.md,
  },
  // Products mode
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.line2,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.ink,
    paddingVertical: spacing.sm,
  },
  productsList: {
    gap: spacing.sm,
  },
  productsHint: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  productsEmpty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  productsEmptyText: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.sm,
    textAlign: 'center',
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.sm,
  },
  productThumb: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  productName: {
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
    fontSize: fontSizes.sm,
  },
  productMerchant: {
    fontFamily: fontFamilies.body,
    color: colors.text.muted,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  productPrice: {
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.brand.red,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brand.red,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  addBtnText: {
    color: colors.white,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xs,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.brand.redLight,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  qtyBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    fontFamily: fontFamilies.headingBold,
    color: colors.brand.red,
    fontSize: fontSizes.sm,
    minWidth: 18,
    textAlign: 'center',
  },
  cartSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.successLight,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.success + '40',
  },
  cartSummaryLabel: {
    fontFamily: fontFamilies.bodyBold,
    color: colors.success,
    fontSize: fontSizes.xs,
  },
  cartSummaryPrice: {
    fontFamily: fontFamilies.headingBlack,
    color: colors.success,
    fontSize: fontSizes.md,
  },
});
