/**
 * Haptics — thin wrapper over expo-haptics that no-ops on web and gracefully
 * degrades when the native module is missing (Expo Go).
 *
 *   haptic.tap()       — neutral tap, e.g. tab change, picker select
 *   haptic.success()   — order placed, payment succeeded
 *   haptic.warning()   — confirm-dangerous prompt opened
 *   haptic.error()     — payment failed, validation error
 *   haptic.heavy()     — major action (e.g. submit big form)
 */
import { Platform } from 'react-native';

type FeedbackKind = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

let cached: typeof import('expo-haptics') | null | undefined;

function load(): typeof import('expo-haptics') | null {
  if (cached !== undefined) return cached;
  if (Platform.OS === 'web') {
    cached = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cached = require('expo-haptics') as typeof import('expo-haptics');
  } catch {
    cached = null;
  }
  return cached;
}

function fire(kind: FeedbackKind): void {
  const mod = load();
  if (!mod) return;
  try {
    if (kind === 'success') {
      mod.notificationAsync(mod.NotificationFeedbackType.Success).catch(() => undefined);
    } else if (kind === 'warning') {
      mod.notificationAsync(mod.NotificationFeedbackType.Warning).catch(() => undefined);
    } else if (kind === 'error') {
      mod.notificationAsync(mod.NotificationFeedbackType.Error).catch(() => undefined);
    } else {
      const style =
        kind === 'heavy'
          ? mod.ImpactFeedbackStyle.Heavy
          : kind === 'medium'
            ? mod.ImpactFeedbackStyle.Medium
            : mod.ImpactFeedbackStyle.Light;
      mod.impactAsync(style).catch(() => undefined);
    }
  } catch {
    /* swallow — haptics must never crash a flow */
  }
}

export const haptic = {
  tap: () => fire('light'),
  medium: () => fire('medium'),
  heavy: () => fire('heavy'),
  success: () => fire('success'),
  warning: () => fire('warning'),
  error: () => fire('error'),
};
