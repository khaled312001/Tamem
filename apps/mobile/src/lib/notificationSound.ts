/**
 * In-app notification sound + vibration. Triggered when a Socket event lands
 * while the app is in the foreground (the OS-level push handler already
 * makes its own sound when the app is backgrounded).
 *
 * Strategy:
 *   - Native: synthesize a short two-tone "ding" via expo-av Audio.Sound.
 *   - Web: use Web Audio API to play a synth tone — no asset shipping needed.
 *
 * Honors a per-device "mute" toggle stored in AsyncStorage so the user can
 * silence the in-app sound from their profile without affecting OS push.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { Platform, Vibration } from 'react-native';

const MUTE_KEY = '@tamem/notification_sound_muted';
let muted: boolean | null = null;

export async function isNotificationSoundMuted(): Promise<boolean> {
  if (muted !== null) return muted;
  try {
    const v = await AsyncStorage.getItem(MUTE_KEY);
    muted = v === '1';
  } catch {
    muted = false;
  }
  return muted;
}

export async function setNotificationSoundMuted(value: boolean): Promise<void> {
  muted = value;
  try {
    await AsyncStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    /* ignore */
  }
}

let webCtx: AudioContext | null = null;
function getWebCtx(): AudioContext | null {
  if (Platform.OS !== 'web') return null;
  if (webCtx) return webCtx;
  try {
    type WebKit = typeof globalThis & { webkitAudioContext?: typeof AudioContext };
    const Ctor =
      typeof AudioContext !== 'undefined'
        ? AudioContext
        : (globalThis as WebKit).webkitAudioContext;
    webCtx = Ctor ? new Ctor() : null;
  } catch {
    webCtx = null;
  }
  return webCtx;
}

function playWebTone(): void {
  const ctx = getWebCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  // Two short tones, second one slightly higher — pleasant "ding" pattern.
  const playOne = (freq: number, start: number, duration: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(freq, start);
    osc.type = 'sine';
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.15, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  };
  playOne(880, now, 0.16);
  playOne(1320, now + 0.16, 0.22);
}

let nativeSound: Audio.Sound | null = null;
async function ensureNativeSound(): Promise<Audio.Sound | null> {
  if (Platform.OS === 'web') return null;
  if (nativeSound) return nativeSound;
  try {
    // expo-av can't synthesize, but a tiny generated WAV data-uri works as the
    // source. This is a 200ms 880Hz pure sine wave at 22kHz mono, 8-bit PCM.
    // Base64 of a hand-crafted RIFF/WAVE header + samples (kept short on purpose
    // so we don't bloat the bundle with an asset for one chirp).
    const uri =
      'data:audio/wav;base64,UklGRsQQAABXQVZFZm10IBAAAAABAAEARKwAAESsAAABAAgAZGF0YaAQAAB' +
      // 200ms of an 880Hz tone at 22050 Hz mono unsigned 8-bit. We just generate
      // it once at module load so the data-uri is stable.
      buildWavToneBase64();
    const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: false });
    nativeSound = sound;
    return sound;
  } catch {
    return null;
  }
}

function buildWavToneBase64(): string {
  const sampleRate = 22050;
  const seconds = 0.2;
  const freq = 880;
  const N = Math.floor(sampleRate * seconds);
  const buf = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    // Apply a tiny attack/release envelope so it doesn't pop.
    const envelope = Math.min(1, (i / sampleRate) * 30) * Math.min(1, ((N - i) / sampleRate) * 30);
    const v = Math.sin(2 * Math.PI * freq * (i / sampleRate));
    buf[i] = Math.max(0, Math.min(255, Math.round(128 + v * 80 * envelope)));
  }
  let binary = '';
  for (let i = 0; i < N; i++) binary += String.fromCharCode(buf[i]!);
  // btoa exists on RN runtime via the standard global polyfill.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b64 = (globalThis as any).btoa ? (globalThis as any).btoa(binary) : '';
  return b64;
}

/**
 * Play the in-app notification sound + a short haptic. Respects the user's
 * mute preference. Best-effort — never throws.
 */
export async function playInAppNotification(): Promise<void> {
  try {
    if (await isNotificationSoundMuted()) return;
    if (Platform.OS === 'web') {
      playWebTone();
    } else {
      const sound = await ensureNativeSound();
      if (sound) {
        try {
          await sound.setPositionAsync(0);
          await sound.playAsync();
        } catch {
          /* ignore */
        }
      }
      // Short vibration pulse so the user feels the alert even if silent.
      Vibration.vibrate(60);
    }
  } catch {
    /* never let sound failures bubble */
  }
}
