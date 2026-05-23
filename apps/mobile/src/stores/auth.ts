import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import type { AuthTokens, User } from '@tamem/types';

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
      SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken),
      SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)),
    ]);
    set({ user, tokens });
  },

  setTokens: async (tokens) => {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken),
      SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken),
    ]);
    set({ tokens });
  },

  clear: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_KEY),
      SecureStore.deleteItemAsync(REFRESH_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
    ]);
    set({ user: null, tokens: null });
  },

  hydrate: async () => {
    const [accessToken, refreshToken, userJson] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_KEY),
      SecureStore.getItemAsync(REFRESH_KEY),
      SecureStore.getItemAsync(USER_KEY),
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
  },
}));

export const getAccessTokenAsync = async (): Promise<string | null> =>
  SecureStore.getItemAsync(ACCESS_KEY);
