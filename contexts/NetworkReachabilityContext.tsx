import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { flushOwnedPersonEpisodeCalendar } from '@/lib/flushOwnedWorkingCopy';
import {
  isNetworkReachable,
  probeSupabaseReachable,
  requireOnline,
  setNetworkReachable,
} from '@/lib/networkReachability';
import { isSupabaseConfigured } from '@/lib/supabase';

const PROBE_INTERVAL_MS = 20_000;

type NetworkReachabilityContextValue = {
  online: boolean;
  requireOnline: () => boolean;
};

const NetworkReachabilityContext = createContext<NetworkReachabilityContextValue>({
  online: true,
  requireOnline,
});

export function NetworkReachabilityProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const { session } = useAuthSession();
  const [online, setOnline] = useState(isNetworkReachable);
  const previousOnlineRef = useRef(isNetworkReachable());
  const flushingRef = useRef(false);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const applyOnline = useCallback((next: boolean) => {
    const wasOnline = previousOnlineRef.current;
    setNetworkReachable(next);
    if (next === wasOnline) {
      return;
    }
    setOnline(next);
    previousOnlineRef.current = next;
    if (next && !wasOnline && sessionRef.current && !flushingRef.current) {
      flushingRef.current = true;
      void flushOwnedPersonEpisodeCalendar().finally(() => {
        flushingRef.current = false;
      });
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!configured) {
      applyOnline(true);
      return;
    }
    const next = await probeSupabaseReachable();
    applyOnline(next);
  }, [applyOnline, configured]);

  useEffect(() => {
    void refresh();
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refresh();
      }
    });
    const timer = configured
      ? setInterval(() => {
          if (AppState.currentState === 'active') {
            void refresh();
          }
        }, PROBE_INTERVAL_MS)
      : null;
    return () => {
      appSub.remove();
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [configured, refresh]);

  const value = useMemo(
    () => ({
      online,
      requireOnline,
    }),
    [online]
  );

  return (
    <NetworkReachabilityContext.Provider value={value}>{children}</NetworkReachabilityContext.Provider>
  );
}

export function useNetworkReachability(): NetworkReachabilityContextValue {
  return useContext(NetworkReachabilityContext);
}

export function useRequireOnline(): () => boolean {
  return useNetworkReachability().requireOnline;
}
