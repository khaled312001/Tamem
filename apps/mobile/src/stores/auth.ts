import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { AuthTokens, User, UserRole } from '@tamem/types';

import { secureStorage } from '../lib/secureStorage';

const ACCESS_KEY = 'tamem_access_token';
const REFRESH_KEY = 'tamem_refresh_token';
const USER_KEY = 'tamem_user';
/** Copy of the signed-in user (profile only, never a token) outside the
 *  Keystore, so a failed secure read can't cost the customer their session. */
const USER_MIRROR_KEY = '@tamem/user_mirror';

function mirrorUser(user: User | null): void {
  void (
    user
      ? AsyncStorage.setItem(USER_MIRROR_KEY, JSON.stringify(user))
      : AsyncStorage.removeItem(USER_MIRROR_KEY)
  ).catch(() => undefined);
}

function parseUser(json: string | null): User | null {
  if (!json) return null;
  try {
    const u = JSON.parse(json) as User;
    return u && typeof u === 'object' && u.id ? u : null;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

/**
 * The logout in flight, if any. Logout calls the API (to unregister the push
 * token), and ANY 401 from the API calls logout — so without this guard a 401
 * from the unregister call itself started another logout, which called
 * unregister again, forever: one phone sent ~25 requests a second until the
 * server's per-IP throttle banned its network (the daily "403 Forbidden").
 * A logout that is already running is simply joined, never restarted.
 */
let clearing: Promise<void> | null = null;

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  tokens: null,
  hydrated: false,

  setSession: async (user, tokens) => {
    await Promise.all([
      secureStorage.setItem(ACCESS_KEY, tokens.accessToken),
      secureStorage.setItem(REFRESH_KEY, tokens.refreshToken),
      secureStorage.setItem(USER_KEY, JSON.stringify(user)),
    ]);
    mirrorUser(user);
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
    mirrorUser(user);
    set({ user });
  },

  clear: () => {
    if (clearing) return clearing;
    clearing = (async () => {
      // Stop pushes to this device BEFORE dropping the token — a shared phone
      // must not keep receiving the previous user's order notifications. Fire it
      // while still authenticated; ignore failures so logout never blocks.
      // Only while there is still a session to identify the phone with — a
      // logged-out device has nothing to unregister.
      if (get().tokens?.accessToken) {
        try {
          const { unregisterPushToken } = await import('../lib/push');
          await unregisterPushToken();
        } catch {
          /* best-effort */
        }
      }
      // Release the Google account too, so the next sign-in shows the account
      // chooser instead of silently re-using the previous user's account on a
      // shared phone. Native module: absent on web, and a no-op if never used.
      try {
        const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
        await GoogleSignin.signOut();
      } catch {
        /* not signed in with Google, or web */
      }
      await Promise.all([
        secureStorage.deleteItem(ACCESS_KEY),
        secureStorage.deleteItem(REFRESH_KEY),
        secureStorage.deleteItem(USER_KEY),
      ]);
      mirrorUser(null);
      set({ user: null, tokens: null });
    })().finally(() => {
      clearing = null;
    });
    return clearing;
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
    mirrorUser(user);
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
    mirrorUser(user);
    set({ user, tokens });
    return { user, tokens };
  },

  hydrate: async () => {
    /*
     * A signed-in customer must come back signed in. This used to read the
     * three values at once and treat ANY failure as "no session", so a single
     * Keystore hiccup at startup (or a lost user record) sent people to the
     * login screen with a perfectly good refresh token still on the phone.
     * Now: read one by one, try again on failure, take the user from the
     * mirror if its secure copy is gone, and only the refresh token decides.
     */
    let accessToken: string | null = null;
    let refreshToken: string | null = null;
    let userJson: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        refreshToken = await secureStorage.getItem(REFRESH_KEY);
        accessToken = await secureStorage.getItem(ACCESS_KEY);
        userJson = await secureStorage.getItem(USER_KEY);
        break;
      } catch {
        await sleep(300 * (attempt + 1));
      }
    }
    if (!refreshToken) {
      set({ hydrated: true });
      return;
    }
    let user = parseUser(userJson);
    if (!user) {
      user = parseUser(await AsyncStorage.getItem(USER_MIRROR_KEY).catch(() => null));
    }
    // A missing access token is fine: the first call gets a 401 and the
    // client refreshes with the refresh token.
    const tokens: AuthTokens = { accessToken: accessToken ?? '', refreshToken };
    if (user) {
      set({ tokens, user, hydrated: true });
      if (!userJson)
        void secureStorage.setItem(USER_KEY, JSON.stringify(user)).catch(() => undefined);
      return;
    }
    // Tokens but no user record anywhere: ask the server who this is.
    set({ tokens });
    try {
      const { api } = await import('../lib/api');
      const res = await api.raw.get('/me');
      const me = (res.data?.data ?? null) as User | null;
      if (me?.id) {
        await secureStorage.setItem(USER_KEY, JSON.stringify(me)).catch(() => undefined);
        mirrorUser(me);
        set({ user: me, hydrated: true });
        return;
      }
    } catch {
      /* no network or a dead session: fall through to the login screen */
    }
    set({ tokens: null, hydrated: true });
  },
}));

// Memory first: every API call used to read the Keystore, in parallel.
export const getAccessTokenAsync = async (): Promise<string | null> =>
  useAuth.getState().tokens?.accessToken || secureStorage.getItem(ACCESS_KEY);
