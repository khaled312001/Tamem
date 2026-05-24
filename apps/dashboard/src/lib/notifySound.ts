/**
 * Generates notification chimes via the Web Audio API — no .mp3/.wav files
 * to ship or manage. Three flavors so the admin can tell apart by ear:
 *   - info    : single short ping (status update, low-priority)
 *   - success : two ascending tones (order completed, payment confirmed)
 *   - alert   : three urgent descending tones (new order, critical alert)
 */

type Tone = 'info' | 'success' | 'alert';

let ctx: AudioContext | null = null;
let mutedUntil = 0; // ms timestamp — anti-spam: collapse rapid bursts

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  // Browsers require a user gesture before AudioContext can play. The first
  // socket event after page load may fail silently; that's fine — once the
  // admin clicks anywhere we'll be unlocked.
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

function beep(freq: number, durationMs: number, when: number, gain = 0.18): void {
  const audio = getCtx();
  if (!audio) return;
  const osc = audio.createOscillator();
  const env = audio.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  env.gain.setValueAtTime(0, audio.currentTime + when);
  env.gain.linearRampToValueAtTime(gain, audio.currentTime + when + 0.01);
  env.gain.linearRampToValueAtTime(0, audio.currentTime + when + durationMs / 1000);
  osc.connect(env).connect(audio.destination);
  osc.start(audio.currentTime + when);
  osc.stop(audio.currentTime + when + durationMs / 1000 + 0.02);
}

export function playChime(tone: Tone): void {
  // Anti-spam: never play more than one chime per 600ms
  const now = Date.now();
  if (now < mutedUntil) return;
  mutedUntil = now + 600;

  if (!isSoundEnabled()) return;

  switch (tone) {
    case 'info':
      beep(880, 140, 0);
      break;
    case 'success':
      beep(660, 110, 0);
      beep(990, 160, 0.12);
      break;
    case 'alert':
      beep(880, 110, 0, 0.22);
      beep(660, 110, 0.13, 0.22);
      beep(440, 200, 0.27, 0.22);
      break;
  }
}

const STORAGE_KEY = 'tamem_sound_enabled';

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v !== '0'; // default ON
}

export function setSoundEnabled(on: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
}
