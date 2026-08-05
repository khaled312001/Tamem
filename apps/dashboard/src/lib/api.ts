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
    const path = window.location.pathname;
    // The merchant portal is its own site: clearing the session already swaps
    // the panel for the merchant sign-in form, so there is nothing to navigate
    // to. Without this a merchant who mistyped their password was thrown onto
    // the ADMIN login at /super_admin/login.
    if (path.startsWith('/merchant')) return;
    // Same idea on the admin side: a failed sign-in renders its own error, and
    // reloading the page would wipe it.
    if (/\/login\/?$/.test(path)) return;
    // Respect Vite's base path. In production the dashboard lives at
    // /super_admin/, so a naked `/login` would drop the base and 404.
    const base = (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL || '/';
    window.location.href = `${base.replace(/\/+$/, '')}/login`;
  },
});
