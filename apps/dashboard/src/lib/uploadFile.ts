/**
 * Uploads a file to the backend's POST /uploads endpoint and returns the
 * public URL. Used by forms that let admins attach images (product gallery,
 * merchant logo, etc.).
 *
 * We bypass the shared axios client on purpose: it sets a default
 * `Content-Type: application/json` header that overrides FormData's
 * auto-boundary, so multer ends up seeing `{}` instead of the file. Using
 * raw `fetch` + FormData lets the browser pick the boundary itself.
 */
import { useAuth } from './auth.js';

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1';

export interface UploadResult {
  url: string;
  key: string;
  mime: string;
  kind: 'image' | 'audio';
}

/**
 * Types the server stores as they are. It decides by the file's bytes, not its
 * name, so a JPEG called `.jfif` (what Chrome on Windows saves from Google
 * Images) goes straight through.
 */
const SERVER_KEEPS = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

/**
 * Formats a browser can open but the server does not keep — AVIF above all,
 * which Google Images serves by default. Re-encoding them here means the admin
 * never has to know what AVIF is. SVG is left out on purpose: it is a document
 * that can carry script, not a photo, and the server refuses it by name.
 */
function needsConversion(file: File): boolean {
  if (!file.type.startsWith('image/')) return false;
  if (file.type === 'image/svg+xml') return false;
  return !SERVER_KEEPS.has(file.type);
}

async function toJpeg(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('المتصفح مش قادر يفتح الصورة دي — احفظها JPG أو PNG وارفعها تاني');
  }
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذّر تجهيز الصورة للرفع');
  // JPEG has no transparency; without a fill, transparent areas turn black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
  if (!blob) throw new Error('تعذّر تحويل الصورة');
  const base = file.name.replace(/\.[^.]+$/, '') || 'image';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
}

export async function uploadFile(input: File): Promise<UploadResult> {
  const file = needsConversion(input) ? await toJpeg(input) : input;
  const token = useAuth.getState().tokens?.accessToken;
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${baseURL}/uploads`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (!res.ok) {
    let msg = `Upload failed (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) msg = body.error.message;
    } catch {
      /* ignore non-JSON body */
    }
    throw new Error(msg);
  }
  const json = (await res.json()) as { data: UploadResult };
  return json.data;
}
