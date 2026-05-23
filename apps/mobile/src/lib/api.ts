import Constants from 'expo-constants';

import { TamemClient } from '@tamem/api-client';

import { getAccessTokenAsync, useAuth } from '../stores/auth';

const baseURL =
  (Constants.expoConfig?.extra?.EXPO_PUBLIC_API_URL as string | undefined) ??
  process.env.EXPO_PUBLIC_API_URL ??
  'http://localhost:4000/api/v1';

export const api = new TamemClient({
  baseURL,
  getAccessToken: getAccessTokenAsync,
  onRefreshNeeded: async () => {
    const tokens = useAuth.getState().tokens;
    if (!tokens?.refreshToken) return null;
    try {
      const newTokens = await api.refresh(tokens.refreshToken);
      await useAuth.getState().setTokens(newTokens);
      return newTokens;
    } catch {
      return null;
    }
  },
  onUnauthorized: () => {
    void useAuth.getState().clear();
  },
});
