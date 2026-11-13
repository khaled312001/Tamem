import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { AuthTokens, User } from '@tamem/types';

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  /** This browser's clock when the tokens arrived — see sessionUsable(). */
  tokensAt: number | null;
  setSession: (user: User, tokens: AuthTokens) => void;
  setTokens: (tokens: AuthTokens) => void;
  setUser: (user: User) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      tokensAt: null,
      setSession: (user, tokens) => set({ user, tokens, tokensAt: Date.now() }),
      setTokens: (tokens) => set({ tokens, tokensAt: Date.now() }),
      setUser: (user) => set({ user }),
      clear: () => set({ user: null, tokens: null, tokensAt: null }),
    }),
    { name: 'tamem-auth' },
  ),
);

function jwtClaims(token: string | undefined): { iat?: number; exp?: number } | null {
  const part = token?.split('.')[1];
  if (!part) return null;
  try {
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

/**
 * Can the saved session still be revived? Admin tokens (access AND refresh) last
 * 6 hours, so an admin coming back after a break used to see the dashboard for a
 * second — until the first API call failed its refresh and bounced them to the
 * login page. When the refresh token has run out there is nothing to revive.
 *
 * The lifetime is measured on this browser's own clock from when the tokens
 * arrived (exp − iat), so a PC whose clock is hours off doesn't sign people out.
 * A token we can't read is left for the server to judge.
 */
export function sessionUsable(s: Pick<AuthState, 'tokens' | 'tokensAt'>): boolean {
  const c = jwtClaims(s.tokens?.refreshToken);
  if (!c?.exp) return true;
  const margin = 30_000;
  if (s.tokensAt && c.iat) return Date.now() - s.tokensAt < (c.exp - c.iat) * 1000 - margin;
  return c.exp * 1000 > Date.now() + margin;
}

// localStorage hydrates synchronously, so this runs before the first render:
// a dead session is dropped here and the guard sends the user straight to login.
{
  const s = useAuth.getState();
  if (s.user && !sessionUsable(s)) s.clear();
}

export const getAccessToken = (): string | null => useAuth.getState().tokens?.accessToken ?? null;
