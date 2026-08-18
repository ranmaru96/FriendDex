import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { initializeDatabase } from '../db';
import { syncTaskReminders } from '@/utils/taskNotifications';

const INTERVAL_MS = 60_000;

export function useTaskReminderSchedule(): void {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearScheduledInterval = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const runSync = () => {
    initializeDatabase();
    void syncTaskReminders();
  };

  const startScheduledInterval = () => {
    clearScheduledInterval();
    intervalRef.current = setInterval(runSync, INTERVAL_MS);
  };

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        runSync();
        startScheduledInterval();
        return;
      }
      clearScheduledInterval();
    };

    runSync();
    if (AppState.currentState === 'active') {
      startScheduledInterval();
    }

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
      clearScheduledInterval();
    };
  }, []);
}
