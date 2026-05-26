/**
 * Tiny audio cue helper for realtime events (new orders, alerts).
 * Uses the Web Audio API to synthesize a short tone — no asset to fetch,
 * works offline, never gets blocked as an "unauthorized media play" because
 * the user already authenticated (which counts as a gesture).
 *
 * Sound preferences are stored in localStorage so the admin can mute without
 * losing the setting on refresh.
 */

const SOUND_STORAGE_KEY = 'tamem:dashboard:soundEnabled';

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const v = window.localStorage.getItem(SOUND_STORAGE_KEY);
  // Default ON for new admins — they want to hear new orders by default.
  return v === null ? true : v === '1';
}

export function setSoundEnabled(on: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SOUND_STORAGE_KEY, on ? '1' : '0');
}

type Tone = { freq: number; duration: number; gain?: number };

let ctxRef: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  // Lazy — instantiating before a user gesture warns in Chrome.
  if (!ctxRef) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctxRef = new Ctor();
  }
  return ctxRef;
}

function playSequence(tones: Tone[]): void {
  if (!isSoundEnabled()) return;
  const audio = ctx();
  if (!audio) return;
  let t = audio.currentTime;
  for (const tone of tones) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = tone.freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(tone.gain ?? 0.14, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + tone.duration);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(t);
    osc.stop(t + tone.duration);
    t += tone.duration;
  }
}

/** Pleasant 2-note chime for new orders. */
export function playNewOrderSound(): void {
  playSequence([
    { freq: 880, duration: 0.18 },
    { freq: 1175, duration: 0.22 },
  ]);
}

/** More urgent 3-note descending pattern for alerts. */
export function playAlertSound(): void {
  playSequence([
    { freq: 660, duration: 0.16, gain: 0.18 },
    { freq: 440, duration: 0.16, gain: 0.18 },
    { freq: 660, duration: 0.22, gain: 0.18 },
  ]);
}
