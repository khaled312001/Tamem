/**
 * Cross-platform voice recorder.
 *
 *   - Web: uses the browser MediaRecorder API + getUserMedia
 *   - iOS/Android: uses expo-av (loaded lazily so web bundles don't break)
 *
 * Both backends expose the same API: { start, stop, getDurationMs, getUri, dispose }.
 * The returned URI is a Blob/File URL on web (playable in <audio>) or a file:// URI
 * on native (playable via Audio.Sound).
 */
import { Platform } from 'react-native';

export interface Recorder {
  start(): Promise<void>;
  stop(): Promise<{ uri: string; mime: string; durationMs: number }>;
  cancel(): Promise<void>;
}

// ─────────── Web ───────────────────────────────────────────────────────────────

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return 'audio/webm';
}

class WebRecorder implements Recorder {
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;

  async start(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('المتصفح لا يدعم تسجيل الصوت');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = pickMime();
    this.rec = new MediaRecorder(this.stream, { mimeType: mime });
    this.chunks = [];
    this.rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.rec.start(250);
    this.startedAt = Date.now();
  }

  stop(): Promise<{ uri: string; mime: string; durationMs: number }> {
    return new Promise((resolve, reject) => {
      if (!this.rec) {
        reject(new Error('لا يوجد تسجيل نشط'));
        return;
      }
      const rec = this.rec;
      rec.onstop = () => {
        const durationMs = Date.now() - this.startedAt;
        const mime = rec.mimeType || pickMime();
        const blob = new Blob(this.chunks, { type: mime });
        const uri = URL.createObjectURL(blob);
        this.releaseStream();
        resolve({ uri, mime, durationMs });
      };
      rec.onerror = (e) => {
        this.releaseStream();
        reject(e);
      };
      rec.stop();
    });
  }

  async cancel(): Promise<void> {
    try {
      if (this.rec && this.rec.state !== 'inactive') this.rec.stop();
    } catch {
      // ignore
    }
    this.releaseStream();
  }

  private releaseStream() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.rec = null;
  }
}

// ─────────── Native (expo-av) ──────────────────────────────────────────────────

class NativeRecorder implements Recorder {
  private rec: unknown = null;
  private startedAt = 0;
  private mime = 'audio/m4a';

  async start(): Promise<void> {
    const { Audio } = await import('expo-av');
    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) throw new Error('لا يوجد إذن للميكروفون');
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY,
    );
    this.rec = recording;
    this.startedAt = Date.now();
  }

  async stop(): Promise<{ uri: string; mime: string; durationMs: number }> {
    if (!this.rec) throw new Error('لا يوجد تسجيل نشط');
    const r = this.rec as { stopAndUnloadAsync: () => Promise<void>; getURI: () => string | null };
    await r.stopAndUnloadAsync();
    const uri = r.getURI() ?? '';
    const durationMs = Date.now() - this.startedAt;
    this.rec = null;
    return { uri, mime: this.mime, durationMs };
  }

  async cancel(): Promise<void> {
    if (!this.rec) return;
    const r = this.rec as { stopAndUnloadAsync: () => Promise<void> };
    try {
      await r.stopAndUnloadAsync();
    } catch {
      // ignore
    }
    this.rec = null;
  }
}

export function createRecorder(): Recorder {
  return Platform.OS === 'web' ? new WebRecorder() : new NativeRecorder();
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
