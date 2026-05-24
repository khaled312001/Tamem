/**
 * Mutes the noisy log spam that Expo + react-native-web emit in dev mode on
 * web. None of these messages indicate a real problem — they're either
 * developer hints aimed at React DevTools users or one-off deprecation
 * notices we've already migrated past in our own code.
 *
 * No-op on native (we keep all logs intact for actual debugging on device).
 * Patches console once when the module is first imported.
 */
import { Platform } from 'react-native';

// Substrings we want gone from the console (case-sensitive).
// Keep this list narrow — we don't want to mask real errors.
const SILENCED_PATTERNS = [
  'Download the React DevTools',
  'Running application "main" with appParams',
  'Development-level warnings: ON',
  'Performance optimizations: OFF',
  'props.pointerEvents is deprecated',
  'Notifications permission has been blocked',
  // React Router v7 deprecation hints — we already opt in via `future` flags
  'React Router will begin wrapping state updates',
  'React Router Future Flag Warning',
  // Expo dev-loading-view race that fires harmless removeChild during HMR
  "Failed to execute 'removeChild' on 'Node'",
  'The above error occurred in the <Fragment>',
  'The above error occurred in the <AppContainer>',
  'The above error occurred in the <NativeSafeAreaProvider>',
];

function shouldSilence(args: unknown[]): boolean {
  for (const a of args) {
    if (typeof a !== 'string') continue;
    for (const pat of SILENCED_PATTERNS) {
      if (a.includes(pat)) return true;
    }
  }
  return false;
}

if (Platform.OS === 'web' && typeof console !== 'undefined') {
  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      if (shouldSilence(args)) return;
      original(...args);
    };
  }
}
