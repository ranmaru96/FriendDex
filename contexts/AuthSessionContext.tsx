import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
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
      initializeDatabase();
      const authUserId = nextSession?.user.id?.trim() ?? '';
      if (!authUserId) {
        setSession(null);
        return;
      }
      if (!isAuthUserAllowedOnThisDevice(authUserId)) {
        setSession(null);
        setDeviceBindError(DEVICE_BIND_MISMATCH_MESSAGE);
        void discardForeignAuthSession();
        return;
      }
      void adoptAuthUserOnThisDevice(authUserId);
      setSession(nextSession);
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
