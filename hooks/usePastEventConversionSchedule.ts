import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { convertPastEventsToAutoEpisodes } from '../utils/eventEpisodeConversion';

const INTERVAL_MS = 60_000;

export function usePastEventConversionSchedule(): void {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearScheduledInterval = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const startScheduledInterval = () => {
    clearScheduledInterval();
    intervalRef.current = setInterval(() => {
      convertPastEventsToAutoEpisodes();
    }, INTERVAL_MS);
  };

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        convertPastEventsToAutoEpisodes();
        startScheduledInterval();
        return;
      }
      clearScheduledInterval();
    };

    if (AppState.currentState === 'active') {
      startScheduledInterval();
    }

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
      clearScheduledInterval();
    };
  }, []);
};
