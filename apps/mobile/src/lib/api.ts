import { Alert } from 'react-native';

import { TamemClient } from '@tamem/api-client';
import type { AuthTokens } from '@tamem/types';

import { getAccessTokenAsync, useAuth } from '../stores/auth';

const baseURL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

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
