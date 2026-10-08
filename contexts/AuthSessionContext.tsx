import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { initializeDatabase } from '@/db';
import {
  DEVICE_BIND_MISMATCH_MESSAGE,
  adoptAuthUserOnThisDevice,
  discardForeignAuthSession,
  isAuthUserAllowedOnThisDevice,
} from '@/lib/deviceAuthBind';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

type AuthSessionContextValue = {
  configured: boolean;
  session: Session | null;
  ready: boolean;
  deviceBindError: string | null;
  clearDeviceBindError: () => void;
};

const AuthSessionContext = createContext<AuthSessionContextValue>({
  configured: false,
  session: null,
  ready: true,
  deviceBindError: null,
  clearDeviceBindError: () => undefined,
});

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!configured);
  const [deviceBindError, setDeviceBindError] = useState<string | null>(null);
  const clearDeviceBindError = useCallback(() => setDeviceBindError(null), []);
  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    if (!configured) {
      sessionRef.current = null;
      setSession(null);
      setReady(true);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      sessionRef.current = null;
      setSession(null);
      setReady(true);
      return;
    }
    const applySession = (nextSession: Session | null, clear: boolean) => {
      initializeDatabase();
      const authUserId = nextSession?.user.id?.trim() ?? '';
      if (!authUserId) {
        if (!clear) {
          return;
        }
        sessionRef.current = null;
        setSession(null);
        return;
      }
      if (!isAuthUserAllowedOnThisDevice(authUserId)) {
        sessionRef.current = null;
        setSession(null);
        setDeviceBindError(DEVICE_BIND_MISMATCH_MESSAGE);
        void discardForeignAuthSession();
        return;
      }
      void adoptAuthUserOnThisDevice(authUserId);
      sessionRef.current = nextSession;
      setSession(nextSession);
    };
    let cancelled = false;
    const { data } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, nextSession) => {
      if (cancelled) {
        return;
      }
      if (event === 'SIGNED_OUT') {
        applySession(null, true);
        setReady(true);
        return;
      }
      if (nextSession?.user?.id) {
        applySession(nextSession, false);
        setReady(true);
        return;
      }
      if (event !== 'INITIAL_SESSION') {
        setReady(true);
        return;
      }
      void supabase.auth.getSession().then(({ data: sessionData }) => {
        if (cancelled) {
          return;
        }
        if (sessionData.session?.user?.id) {
          applySession(sessionData.session, false);
        } else if (!sessionRef.current) {
          applySession(null, true);
        }
        setReady(true);
      });
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [configured]);

  const value = useMemo(
    () => ({
      configured,
      session,
      ready,
      deviceBindError,
      clearDeviceBindError,
    }),
    [clearDeviceBindError, configured, deviceBindError, ready, session]
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession(): AuthSessionContextValue {
  return useContext(AuthSessionContext);
}
