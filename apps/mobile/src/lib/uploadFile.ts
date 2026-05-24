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

import { api } from './api';

export interface UploadResult {
  url: string;
  uploaded: boolean;
}

export async function uploadFile(
  uri: string,
  opts: { name?: string; mime?: string } = {},
): Promise<UploadResult> {
  const form = new FormData();
  const mime = opts.mime ?? guessMime(uri);
  const name = opts.name ?? guessName(uri, mime);

  try {
    if (Platform.OS === 'web') {
      const res = await fetch(uri);
      const blob = await res.blob();
      const file = new File([blob], name, { type: mime });
      form.append('file', file);
    } else {
      form.append('file', {
        uri,
        name,
        type: mime,
      } as unknown as Blob);
    }

    // NB: don't set Content-Type manually — axios + FormData inject the
    // multipart boundary automatically. Setting the header by hand strips
    // the boundary and multer rejects the request silently.
    const res = await api.raw.post('/uploads', form);
    return { url: res.data.data.url as string, uploaded: true };
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
