/**
 * Uploads a file (image OR audio) to the backend's /uploads endpoint and
 * returns the resulting public URL. Handles both web and native:
 *   - Web: fetches the URI to a Blob and appends as a real File
 *   - Native: appends the { uri, name, type } shape RN's FormData understands
 *
 * Falls back to the original URI if the upload fails — caller can decide what
 * to do (e.g. show a warning), but the order can still go through with a
 * non-hosted URI so it's never blocked entirely by a flaky network.
 */
import { Platform } from 'react-native';

import { getAccessTokenAsync } from '../stores/auth';

export interface UploadResult {
  url: string;
  uploaded: boolean;
}

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * Uploads a file via the browser's native fetch / RN's fetch. We deliberately
 * bypass the shared axios api client because it sets a default
 * `Content-Type: application/json` header that overrides axios's FormData
 * auto-boundary, causing the form to arrive as `{}` at multer.
 *
 * With raw fetch + FormData:
 *   - Web: the browser sets `Content-Type: multipart/form-data; boundary=...`
 *     automatically when it sees a FormData body. We MUST NOT set it ourselves
 *     because that strips the boundary.
 *   - Native (Expo / RN): the same auto-detection works for FormData with
 *     `{ uri, name, type }` entries.
 */
export async function uploadFile(
  uri: string,
  opts: { name?: string; mime?: string } = {},
): Promise<UploadResult> {
  const form = new FormData();
  const mime = opts.mime ?? guessMime(uri);
  const name = opts.name ?? guessName(uri, mime);

  try {
    if (Platform.OS === 'web') {
      const blobRes = await fetch(uri);
      const blob = await blobRes.blob();
      const file = new File([blob], name, { type: mime });
      form.append('file', file);
    } else {
      form.append('file', {
        uri,
        name,
        type: mime,
      } as unknown as Blob);
    }

    const token = await getAccessTokenAsync();
    // No Content-Type header on purpose — let the runtime compute the boundary.
    const res = await fetch(`${API_URL}/uploads`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });
    if (!res.ok) {
      throw new Error(`upload failed: HTTP ${res.status}`);
    }
    const json = (await res.json()) as { data: { url: string } };
    return { url: json.data.url, uploaded: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[uploadFile] failed, falling back to original URI:', err);
    return { url: uri, uploaded: false };
  }
}

function guessMime(uri: string): string {
  if (uri.startsWith('data:')) {
    const m = /^data:([^;]+)/.exec(uri);
    if (m) return m[1] ?? 'application/octet-stream';
  }
  const ext = uri.split('.').pop()?.toLowerCase().split(/[?#]/)[0] ?? '';
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'm4a':
      return 'audio/mp4';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'webm':
      return 'audio/webm';
    case 'ogg':
      return 'audio/ogg';
    case 'aac':
      return 'audio/aac';
    default:
      return 'application/octet-stream';
  }
}

function guessName(uri: string, mime: string): string {
  const ext = mime.split('/')[1]?.split(';')[0] ?? 'bin';
  const base = uri.split('/').pop()?.split('?')[0] ?? `file-${Date.now()}`;
  return base.includes('.') ? base : `${base}.${ext}`;
}
