/**
 * A strong login password an admin can read down the phone.
 *
 * Two constraints pulling against each other: it has to survive being guessed,
 * and it has to survive being dictated to a shopkeeper and typed back on a
 * phone keyboard. So:
 *
 * - `crypto.getRandomValues`, never Math.random — a password generator seeded
 *   from a predictable PRNG is decoration.
 * - Ambiguous glyphs are out entirely (0/O, 1/l/I). "صفر ولا حرف O؟" over a bad
 *   line is how a correct password gets typed wrong three times and blamed on
 *   the system.
 * - Symbols are limited to a handful that exist on every Arabic phone keyboard
 *   without hunting through a third page.
 * - One character of each class is placed first and then the whole thing is
 *   shuffled, so "has an uppercase and a digit and a symbol" is guaranteed
 *   rather than probable.
 */
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I, O
const LOWER = 'abcdefghijkmnopqrstuvwxyz'; // no l
const DIGIT = '23456789'; // no 0, 1
const SYMBOL = '!@#$%*?';

const ALL = UPPER + LOWER + DIGIT + SYMBOL;

/** Uniform 0..n-1, rejection-sampled so the modulo doesn't skew the result. */
function randomInt(n: number): number {
  const max = Math.floor(256 / n) * n;
  const buf = new Uint8Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    const v = buf[0] as number;
    if (v < max) return v % n;
  }
}

const pick = (alphabet: string): string => alphabet[randomInt(alphabet.length)] as string;

export function generatePassword(length = 12): string {
  const len = Math.max(8, length);
  const chars = [pick(UPPER), pick(LOWER), pick(DIGIT), pick(SYMBOL)];
  while (chars.length < len) chars.push(pick(ALL));

  // Fisher-Yates, so the four guaranteed classes don't always sit in the first
  // four positions and give away the shape of every password we issue.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j] as string, chars[i] as string];
  }
  return chars.join('');
}

/** Copy to the clipboard, with a fallback for contexts that block the async API. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
