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

export async function uploadFile(file: File): Promise<UploadResult> {
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
