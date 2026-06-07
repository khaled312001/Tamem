/**
 * Cross-platform confirm/alert helper.
 *
 * React Native's `Alert.alert` is silently no-op on web (RN Web doesn't
 * implement it), so the logout/delete-account buttons looked broken when
 * the customer used the web build. This module routes to:
 *
 *   - native:  Alert.alert (multi-button native dialog)
 *   - web:     window.confirm / window.alert
 *
 * Caller passes the same callbacks as Alert.alert — we extract the
 * non-cancel buttons and run their onPress when the user confirms.
 */
import { Alert, Platform, type AlertButton } from 'react-native';

export function confirm(title: string, message: string, buttons: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }

  // On web, browser dialogs only support one OK + Cancel. Run the first
  // non-cancel button's onPress when the user clicks OK; ignore others.
  const action = buttons.find((b) => b.style !== 'cancel');
  if (!action) {
    // Pure informational alert.
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
    return;
  }

  if (typeof window !== 'undefined') {
    const ok = window.confirm(`${title}\n\n${message}`);
    if (ok) {
      void action.onPress?.();
    } else {
      const cancel = buttons.find((b) => b.style === 'cancel');
      void cancel?.onPress?.();
    }
  }
}

/** One-line confirm — returns a promise resolving to true/false. */
export function confirmAsync(title: string, message: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (Platform.OS !== 'web') {
      Alert.alert(title, message, [
        { text: 'إلغاء', style: 'cancel', onPress: () => resolve(false) },
        { text: 'تأكيد', style: 'destructive', onPress: () => resolve(true) },
      ]);
      return;
    }
    if (typeof window !== 'undefined') {
      resolve(window.confirm(`${title}\n\n${message}`));
    } else {
      resolve(false);
    }
  });
}

/** One-line alert (no choice) — fire-and-forget. */
export function notify(title: string, message?: string): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message);
    return;
  }
  if (typeof window !== 'undefined') {
    window.alert(message ? `${title}\n\n${message}` : title);
  }
}
