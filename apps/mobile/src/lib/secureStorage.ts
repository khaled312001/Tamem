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

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return webStorage()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    }
    return nativeStore!.getItemAsync(key);
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
    await nativeStore!.setItemAsync(key, value);
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
    await nativeStore!.deleteItemAsync(key);
  },
};
