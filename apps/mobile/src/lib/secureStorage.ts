// Cross-platform secure storage.
// - Native: expo-secure-store (Keychain on iOS, KeyStore on Android)
// - Web: localStorage (acceptable for dev; production web build would need cookies/IndexedDB)

import { Platform } from 'react-native';

interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const webStorage = (): WebStorageLike | undefined => {
  const g = globalThis as { localStorage?: WebStorageLike };
  return g.localStorage;
};

let nativeStore: typeof import('expo-secure-store') | undefined;
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  nativeStore = require('expo-secure-store');
}

/*
 * The Android Keystore behind expo-secure-store can fail when several reads
 * and writes run at the same time (every API call used to read the token, in
 * parallel with the refresh writing new ones), and the session lives here: one
 * failed read at startup put a signed-in customer back on the login screen.
 * So the native store runs one operation at a time, and a failed one is tried
 * again before giving up.
 */
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(op: () => Promise<T>): Promise<T> {
  const run = chain.then(op, op);
  chain = run.catch(() => undefined);
  return run;
}
async function withRetry<T>(op: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await serial(op);
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 120 * (i + 1)));
    }
  }
  throw last;
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return webStorage()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    }
    return withRetry(() => nativeStore!.getItemAsync(key));
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        webStorage()?.setItem(key, value);
      } catch {
        // ignore
      }
      return;
    }
    await withRetry(() => nativeStore!.setItemAsync(key, value));
  },

  async deleteItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        webStorage()?.removeItem(key);
      } catch {
        // ignore
      }
      return;
    }
    // Logout must always finish, even if the store misbehaves.
    await withRetry(() => nativeStore!.deleteItemAsync(key)).catch(() => undefined);
  },
};
