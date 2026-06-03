/**
 * Cross-platform clipboard wrapper. Uses navigator.clipboard on web (most
 * reliable) and falls back to a dynamic require of expo-clipboard on native.
 * Returns true on success so callers can show "تم النسخ" only when it really
 * landed.
 */
import { Platform } from 'react-native';

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      return false;
    }
    // Native: dynamic require so projects without expo-clipboard installed
    // still typecheck and run.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('expo-clipboard') as {
        setStringAsync?: (s: string) => Promise<void>;
        setString?: (s: string) => void;
      };
      if (mod.setStringAsync) {
        await mod.setStringAsync(text);
        return true;
      }
      if (mod.setString) {
        mod.setString(text);
        return true;
      }
    } catch {
      /* expo-clipboard not installed */
    }
    return false;
  } catch {
    return false;
  }
}
