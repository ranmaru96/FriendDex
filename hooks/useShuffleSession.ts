import { useCallback, useEffect, useRef, useState } from 'react';
import {
  flushShuffleSession,
  loadShuffleSession,
  persistShuffleSession,
  type ShuffleSessionState,
} from '@/utils/shuffleSession';

export function useShuffleSession() {
  const [session, setSessionState] = useState<ShuffleSessionState>(loadShuffleSession);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    persistShuffleSession(session);
  }, [session]);

  useEffect(() => {
    return () => {
      persistShuffleSession(sessionRef.current);
      flushShuffleSession();
    };
  }, []);

  const setSession = useCallback(
    (next: ShuffleSessionState | ((prev: ShuffleSessionState) => ShuffleSessionState)) => {
      setSessionState((prev) => (typeof next === 'function' ? next(prev) : next));
    },
    []
  );

  return [session, setSession] as const;
}
