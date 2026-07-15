import { TamemClient } from '@tamem/api-client';
import type { AuthTokens } from '@tamem/types';

import { getAccessToken, useAuth } from './auth.js';

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1';

export const api: TamemClient = new TamemClient({
  baseURL,
  getAccessToken,
  onRefreshNeeded: async (): Promise<AuthTokens | null> => {
    const tokens = useAuth.getState().tokens;
    if (!tokens?.refreshToken) return null;
    try {
      const newTokens: AuthTokens = await api.refresh(tokens.refreshToken);
      useAuth.getState().setTokens(newTokens);
      return newTokens;
    } catch {
      return null;
    }
  },
  onUnauthorized: () => {
    useAuth.getState().clear();
    // Respect Vite's base path. In production the dashboard lives at
    // /super_admin/, so a naked `/login` would drop the base and 404.
    const base = (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL || '/';
    window.location.href = `${base.replace(/\/+$/, '')}/login`;
  },
});
