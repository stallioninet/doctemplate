'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';

const STORAGE_KEY = 'doctemplate.auth';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  organizationId: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

interface AuthContextValue {
  session: AuthSession | null;
  loading: boolean;
  setSession: (session: AuthSession | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSessionState(JSON.parse(raw) as AuthSession);
    } catch {
      // corrupted local storage — drop it
      localStorage.removeItem(STORAGE_KEY);
    }
    setLoading(false);
  }, []);

  const setSession = useCallback((next: AuthSession | null) => {
    setSessionState(next);
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  const logout = useCallback(() => setSession(null), [setSession]);

  return (
    <AuthContext.Provider value={{ session, loading, setSession, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/**
 * Client-side route guard. Redirects to /login when no session is loaded.
 * Returns the session once available so callers can `if (!session) return null`.
 */
export function useRequireAuth(): { session: AuthSession | null; loading: boolean } {
  const { session, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !session) router.replace('/login');
  }, [loading, session, router]);
  return { session, loading };
}
