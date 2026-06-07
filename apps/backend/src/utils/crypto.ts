/**
 * Symmetric encryption for sensitive secrets stored at rest (third-party
 * API tokens, etc). AES-256-GCM keyed by PRODUCTS_API_ENC_KEY.
 *
 * Output format: `v1:<iv-base64>:<authTag-base64>:<ciphertext-base64>`.
 * We prefix with a scheme version so we can rotate the key later without
 * breaking decrypt on older rows.
 *
 * Falls back to a development key when the env var isn't set so the dev
 * loop works out of the box — production MUST set its own.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const DEV_FALLBACK_KEY = 'tamem-dev-encryption-key-please-set-PRODUCTS_API_ENC_KEY-in-prod';

function getKey(): Buffer {
  const raw = process.env.PRODUCTS_API_ENC_KEY?.trim() || DEV_FALLBACK_KEY;
  // SHA-256 → 32 bytes regardless of input length.
  return createHash('sha256').update(raw).digest();
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) return '';
  const key = getKey();
  const iv = randomBytes(12); // GCM standard nonce length
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(ciphertext: string): string {
  if (!ciphertext) return '';
  const parts = ciphertext.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    // Older/malformed ciphertext — return as-is rather than throwing, so a
    // sync attempt fails cleanly instead of crashing the request.
    return '';
  }
  try {
    const key = getKey();
    const iv = Buffer.from(parts[1]!, 'base64');
    const tag = Buffer.from(parts[2]!, 'base64');
    const enc = Buffer.from(parts[3]!, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return '';
  }
}

/** Mask a secret for display — keeps the first 4 chars + ******** suffix. */
export function maskSecret(plaintext: string): string {
  if (!plaintext) return '';
  if (plaintext.length <= 6) return '••••••';
  return `${plaintext.slice(0, 4)}••••••••`;
}
