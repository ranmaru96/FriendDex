import { useEffect, useRef } from 'react';
import { AppState, InteractionManager, type AppStateStatus } from 'react-native';
import { initializeDatabase } from '../db';
import { syncTaskReminders } from '@/utils/taskNotifications';

const INTERVAL_MS = 60_000;

/** 起動時にマウントしない。通知同期はタスク保存時と Tasks タブ focus で行う。 */
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

    const afterFirstPaint = InteractionManager.runAfterInteractions(() => {
      runSync();
      if (AppState.currentState === 'active') {
        startScheduledInterval();
      }
    });

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      afterFirstPaint.cancel();
      subscription.remove();
      clearScheduledInterval();
    };
  }, []);
}
