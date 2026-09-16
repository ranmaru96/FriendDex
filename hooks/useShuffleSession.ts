import { useCallback, useEffect, useState } from 'react';
import {
  flushShuffleSession,
  loadShuffleSession,
  persistShuffleSession,
  type ShuffleSessionState,
} from '@/utils/shuffleSession';

export function useShuffleSession() {
  const [session, setSessionState] = useState<ShuffleSessionState>(loadShuffleSession);

  useEffect(() => {
    persistShuffleSession(session);
  }, [session]);

  useEffect(() => {
    return () => {
      flushShuffleSession();
    };
  }, []);

  const setSession = useCallback(
    (next: ShuffleSessionState | ((prev: ShuffleSessionState) => ShuffleSessionState)) => {
      setSessionState((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        persistShuffleSession(resolved);
        return resolved;
      });
    },
    []
  );

  return [session, setSession] as const;
}
