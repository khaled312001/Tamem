import { create } from 'zustand';

import type { AuthTokens, User } from '@tamem/types';

import { secureStorage } from '../lib/secureStorage';

const ACCESS_KEY = 'tamem_access_token';
const REFRESH_KEY = 'tamem_refresh_token';
const USER_KEY = 'tamem_user';

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  hydrated: boolean;
  setSession: (user: User, tokens: AuthTokens) => Promise<void>;
  setTokens: (tokens: AuthTokens) => Promise<void>;
  clear: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  tokens: null,
  hydrated: false,

  setSession: async (user, tokens) => {
    await Promise.all([
      secureStorage.setItem(ACCESS_KEY, tokens.accessToken),
      secureStorage.setItem(REFRESH_KEY, tokens.refreshToken),
      secureStorage.setItem(USER_KEY, JSON.stringify(user)),
    ]);
    set({ user, tokens });
  },

  setTokens: async (tokens) => {
    await Promise.all([
      secureStorage.setItem(ACCESS_KEY, tokens.accessToken),
      secureStorage.setItem(REFRESH_KEY, tokens.refreshToken),
    ]);
    set({ tokens });
  },

  clear: async () => {
    await Promise.all([
      secureStorage.deleteItem(ACCESS_KEY),
      secureStorage.deleteItem(REFRESH_KEY),
      secureStorage.deleteItem(USER_KEY),
    ]);
    set({ user: null, tokens: null });
  },

  hydrate: async () => {
    try {
      const [accessToken, refreshToken, userJson] = await Promise.all([
        secureStorage.getItem(ACCESS_KEY),
        secureStorage.getItem(REFRESH_KEY),
        secureStorage.getItem(USER_KEY),
      ]);
      if (accessToken && refreshToken && userJson) {
        set({
          tokens: { accessToken, refreshToken },
          user: JSON.parse(userJson) as User,
          hydrated: true,
        });
      } else {
        set({ hydrated: true });
      }
    } catch {
      set({ hydrated: true });
    }
  },
}));

export const getAccessTokenAsync = async (): Promise<string | null> =>
  secureStorage.getItem(ACCESS_KEY);
