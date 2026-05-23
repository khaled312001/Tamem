import { TamemClient } from '@tamem/api-client';
import type { AuthTokens } from '@tamem/types';

import { getAccessTokenAsync, useAuth } from '../stores/auth';

const baseURL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

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
  },
});
