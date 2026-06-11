import { Alert, Platform } from 'react-native';

import { TamemClient } from '@tamem/api-client';
import type { AuthTokens } from '@tamem/types';

import { getAccessTokenAsync, useAuth } from '../stores/auth';

/**
 * Resolve the API base URL with smart fallbacks:
 *   - **Web** (browser dev): always use the same hostname the page was served
 *     from on port 4000. This avoids the trap where the .env points at a LAN
 *     IP (for testing on a physical Android device) but the developer opens
 *     the web build on the same machine and the LAN IP isn't reachable
 *     (firewall, NAT, sleeping interface, etc).
 *   - **Native** (iOS/Android emulator or real device): use the env value so
 *     a real phone on the same Wi-Fi can hit the dev backend by LAN IP.
 *   - **Fallback**: localhost — used by tests/unit code without an env.
 */
function resolveBaseURL(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const host = window.location.hostname || 'localhost';
    return `http://${host}:4000/api/v1`;
  }
  return process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
}

const baseURL = resolveBaseURL();

// Throttle: don't spam the user with "session expired" if multiple requests
// race to 401 at the same time.
let lastSessionExpiredAt = 0;

export const api: TamemClient = new TamemClient({
  baseURL,
  getAccessToken: getAccessTokenAsync,
  onRefreshNeeded: async (): Promise<AuthTokens | null> => {
    const tokens = useAuth.getState().tokens;
    if (!tokens?.refreshToken) return null;
    try {
      const newTokens: AuthTokens = await api.refresh(tokens.refreshToken);
      await useAuth.getState().setTokens(newTokens);
      return newTokens;
    } catch {
      return null;
    }
  },
  onUnauthorized: () => {
    void useAuth.getState().clear();
    const now = Date.now();
    if (now - lastSessionExpiredAt > 5000) {
      lastSessionExpiredAt = now;
      Alert.alert('انتهت الجلسة', 'برجاء تسجيل الدخول مرة أخرى للمتابعة.');
    }
  },
});
