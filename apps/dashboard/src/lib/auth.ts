import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { AuthTokens, User } from '@tamem/types';

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  setSession: (user: User, tokens: AuthTokens) => void;
  setTokens: (tokens: AuthTokens) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      setSession: (user, tokens) => set({ user, tokens }),
      setTokens: (tokens) => set({ tokens }),
      clear: () => set({ user: null, tokens: null }),
    }),
    { name: 'tamem-auth' },
  ),
);

export const getAccessToken = (): string | null => useAuth.getState().tokens?.accessToken ?? null;
