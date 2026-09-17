import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  applyAuthUserIdToMyselfProfile,
  getSupabaseClient,
  isSupabaseConfigured,
} from '@/lib/supabase';

type AuthSessionContextValue = {
  configured: boolean;
  session: Session | null;
  ready: boolean;
};

const AuthSessionContext = createContext<AuthSessionContextValue>({
  configured: false,
  session: null,
  ready: true,
});

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!configured);

  useEffect(() => {
    if (!configured) {
      setSession(null);
      setReady(true);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setSession(null);
      setReady(true);
      return;
    }
    const applySession = (nextSession: Session | null) => {
      setSession(nextSession);
      const authUserId = nextSession?.user.id?.trim();
      if (authUserId) {
        applyAuthUserIdToMyselfProfile(authUserId);
      }
    };
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        applySession(data.session ?? null);
        setReady(true);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession);
      setReady(true);
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [configured]);

  const value = useMemo(
    () => ({ configured, session, ready }),
    [configured, ready, session]
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession(): AuthSessionContextValue {
  return useContext(AuthSessionContext);
}
