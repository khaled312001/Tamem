/**
 * Strong passwords a person can actually read back down a phone line.
 *
 * The alphabets deliberately drop every pair that looks the same in the fonts
 * people read passwords in: 0/O, 1/l/I. A customer who writes the password on
 * a receipt and types it back tomorrow should not fail because the zero was an
 * O — "صفر ولا حرف O؟" is how a correct password gets typed wrong three times
 * and blamed on the app.
 *
 * Symbols are limited to the ones present on the first page of both the Arabic
 * and English phone keyboards. A password containing `~` is technically
 * stronger and practically unusable on a keyboard the customer has to hunt
 * through.
 */
import * as Crypto from 'expo-crypto';

const LOWER = 'abcdefghijkmnopqrstuvwxyz'; // no l
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I, no O
const DIGITS = '23456789'; // no 0, no 1
const SYMBOLS = '!@#$%*?';

const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

/**
 * A uniformly-distributed integer in [0, max).
 *
 * Rejection sampling, not `% max`: taking the remainder of a random byte biases
 * the low values whenever 256 is not a multiple of `max`, which quietly makes
 * the generated passwords weaker than their length suggests.
 */
function randomInt(max: number): number {
  const limit = Math.floor(256 / max) * max;
  // Ask for a few bytes at a time — the loop almost never runs twice, and a
  // fresh syscall per attempt is wasteful.
  for (;;) {
    const bytes = Crypto.getRandomBytes(8);
    for (let i = 0; i < bytes.length; i += 1) {
      const b = bytes[i] as number;
      if (b < limit) return b % max;
    }
  }
}

function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)] as string;
}

/**
 * Generate a password of `length` characters (12 by default) containing at
 * least one character of each class.
 *
 * The guaranteed characters are placed first and then shuffled, because
 * appending them would put a symbol at a predictable position in every
 * password this ever produces.
 */
export function generatePassword(length = 12): string {
  const size = Math.max(8, Math.min(length, 32));
  const chars: string[] = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < size) chars.push(pick(ALL));

  // Fisher-Yates with the same unbiased source.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const a = chars[i] as string;
    chars[i] = chars[j] as string;
    chars[j] = a;
  }
  return chars.join('');
}

export interface PasswordCheck {
  key: 'length' | 'letter' | 'digit' | 'symbol';
  label: string;
  ok: boolean;
  /** Blocks submission. Only the length rule does — see below. */
  required: boolean;
}

/**
 * What the password satisfies, rule by rule.
 *
 * Only the length rule blocks. The server accepts any 8 characters
 * (`strlen($password) < 8` in api.php, on both register and reset), so adding
 * client-side rules the server does not share would reject passwords the
 * account can perfectly well have — and the customer standing in a shop with a
 * password that "works on the website" has no way to understand why. The other
 * three are shown as advice and drive the strength bar.
 */
export function checkPassword(pw: string): PasswordCheck[] {
  return [
    { key: 'length', label: '8 أحرف على الأقل', ok: pw.length >= 8, required: true },
    { key: 'letter', label: 'حرف إنجليزي', ok: /[A-Za-z]/.test(pw), required: false },
    { key: 'digit', label: 'رقم', ok: /\d/.test(pw), required: false },
    { key: 'symbol', label: 'رمز (مثل @ أو #)', ok: /[^A-Za-z0-9]/.test(pw), required: false },
  ];
}

export type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong';

export function passwordStrength(pw: string): PasswordStrength {
  if (pw.length < 8) return 'weak';
  const classes = checkPassword(pw).filter((c) => !c.required && c.ok).length;
  const long = pw.length >= 12;
  if (classes >= 3 && long) return 'strong';
  if (classes >= 2 && pw.length >= 10) return 'good';
  if (classes >= 1) return 'fair';
  return 'weak';
}

export const STRENGTH_LABEL: Record<PasswordStrength, string> = {
  weak: 'ضعيفة',
  fair: 'مقبولة',
  good: 'جيدة',
  strong: 'قوية',
};
