import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { admin } from '../lib/api';
import { ApiError, auth, type AuthUser } from '../lib/supabase';

type Status = 'checking' | 'signed-out' | 'admin';
interface AuthState {
  status: Status;
  user: AuthUser | null;
  /** why we're signed out, shown on the login screen */
  notice: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>(null as unknown as AuthState);
export const useAuth = () => useContext(Ctx);

async function verifyAdmin(userId: string) {
  try {
    return await admin.isAdmin(userId);
  } catch (e) {
    if (e instanceof ApiError && (e.code === '42P01' || e.code === 'PGRST205' || /setup/i.test(e.message))) {
      throw new ApiError('The admin_users table is missing — run supabase/setup.sql in the Supabase SQL editor first.', 0, 'setup');
    }
    throw e;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(auth.session ? 'checking' : 'signed-out');
  const [user, setUser] = useState<AuthUser | null>(auth.session?.user ?? null);
  const [notice, setNotice] = useState<string | null>(null);

  // restore an existing session on load
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!auth.session) return;
      try {
        const s = await auth.getSession();
        if (!s) throw new ApiError('Your session has expired. Please sign in again.', 401);
        const ok = await verifyAdmin(s.user.id);
        if (!alive) return;
        if (!ok) {
          await auth.signOut();
          setNotice('This account does not have admin access.');
          setStatus('signed-out');
          return;
        }
        setUser(s.user);
        setStatus('admin');
      } catch (e) {
        if (!alive) return;
        if (e instanceof ApiError && e.code === 'network') {
          setNotice('Could not reach the server. Check your connection and reload.');
        } else {
          await auth.signOut();
          setNotice(e instanceof Error ? e.message : 'Please sign in again.');
        }
        setStatus('signed-out');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // react to expiry / sign-out in this or another tab
  useEffect(
    () =>
      auth.onChange((event, s) => {
        if (event === 'SESSION_EXPIRED') {
          setNotice('Your session has expired. Please sign in again.');
          setUser(null);
          setStatus('signed-out');
        } else if (event === 'SIGNED_OUT' || !s) {
          setUser(null);
          setStatus('signed-out');
        }
      }),
    [],
  );

  // proactively refresh shortly before expiry while the dashboard is open
  useEffect(() => {
    if (status !== 'admin') return;
    const id = setInterval(() => {
      auth.getSession().catch(() => {});
    }, 60_000);
    return () => clearInterval(id);
  }, [status]);

  const signIn = useCallback(async (email: string, password: string) => {
    setNotice(null);
    const s = await auth.signIn(email.trim(), password);
    let ok = false;
    try {
      ok = await verifyAdmin(s.user.id);
    } catch (e) {
      await auth.signOut();
      throw e;
    }
    if (!ok) {
      await auth.signOut();
      throw new ApiError('This account does not have admin access.', 403, 'not_admin');
    }
    setUser(s.user);
    setStatus('admin');
  }, []);

  const signOut = useCallback(async () => {
    await auth.signOut();
    setNotice('You have been signed out.');
    setUser(null);
    setStatus('signed-out');
  }, []);

  return <Ctx.Provider value={{ status, user, notice, signIn, signOut }}>{children}</Ctx.Provider>;
}
