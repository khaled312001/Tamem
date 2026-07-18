import { create } from 'zustand';

import type { AuthTokens, User, UserRole } from '@tamem/types';

import { secureStorage } from '../lib/secureStorage';

const ACCESS_KEY = 'tamem_access_token';
const REFRESH_KEY = 'tamem_refresh_token';
const USER_KEY = 'tamem_user';

/** Signup-only role choice. DRIVER/ADMIN are admin-provisioned. */
export type SignupRole = Extract<UserRole, 'CUSTOMER' | 'MERCHANT'>;

interface RegisterPayload {
  name: string;
  phone: string;
  password: string;
  city: string;
  address?: string;
  role?: SignupRole;
}

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  hydrated: boolean;
  setSession: (user: User, tokens: AuthTokens) => Promise<void>;
  setTokens: (tokens: AuthTokens) => Promise<void>;
  setUser: (user: User) => Promise<void>;
  clear: () => Promise<void>;
  hydrate: () => Promise<void>;
  /**
   * Phone-based registration. Forwards `role` to the backend so users can
   * sign up as MERCHANT directly from the mobile signup form. The backend
   * defaults to CUSTOMER when role is omitted, so older callers stay safe.
   */
  register: (payload: RegisterPayload) => Promise<{ user: User; tokens: AuthTokens }>;
  /**
   * Google OAuth exchange. `role` is only honored by the backend when
   * creating a brand-new user — returning users keep their existing role.
   */
  loginWithGoogle: (
    idToken: string,
    role?: SignupRole,
  ) => Promise<{ user: User; tokens: AuthTokens }>;
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

  setUser: async (user) => {
    await secureStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ user });
  },

  clear: async () => {
    // Stop pushes to this device BEFORE dropping the token — a shared phone
    // must not keep receiving the previous user's order notifications. Fire it
    // while still authenticated; ignore failures so logout never blocks.
    try {
      const { unregisterPushToken } = await import('../lib/push');
      await unregisterPushToken();
    } catch {
      /* best-effort */
    }
    await Promise.all([
      secureStorage.deleteItem(ACCESS_KEY),
      secureStorage.deleteItem(REFRESH_KEY),
      secureStorage.deleteItem(USER_KEY),
    ]);
    set({ user: null, tokens: null });
  },

  register: async (payload) => {
    // Lazy import to avoid the lib/api ↔ stores/auth circular dependency
    // (api.ts pulls getAccessTokenAsync/useAuth from this file).
    const { api } = await import('../lib/api');
    const res = await api.raw.post('/auth/register', payload);
    const { user, tokens } = res.data.data as { user: User; tokens: AuthTokens };
    await Promise.all([
      secureStorage.setItem(ACCESS_KEY, tokens.accessToken),
      secureStorage.setItem(REFRESH_KEY, tokens.refreshToken),
      secureStorage.setItem(USER_KEY, JSON.stringify(user)),
    ]);
    set({ user, tokens });
    return { user, tokens };
  },

  loginWithGoogle: async (idToken, role) => {
    const { api } = await import('../lib/api');
    const res = await api.raw.post('/auth/google', {
      idToken,
      ...(role ? { role } : {}),
    });
    const { user, tokens } = res.data.data as { user: User; tokens: AuthTokens };
    await Promise.all([
      secureStorage.setItem(ACCESS_KEY, tokens.accessToken),
      secureStorage.setItem(REFRESH_KEY, tokens.refreshToken),
      secureStorage.setItem(USER_KEY, JSON.stringify(user)),
    ]);
    set({ user, tokens });
    return { user, tokens };
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
