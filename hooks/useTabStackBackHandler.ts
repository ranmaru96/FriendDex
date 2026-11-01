import { useEffect } from 'react';
import { BackHandler } from 'react-native';
import { router } from 'expo-router';
import { popCurrentTabScreen } from '@/utils/tabNavigation';

export function useTabStackBackHandler(enabled: boolean) {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (popCurrentTabScreen()) {
        return true;
      }
      if (router.canGoBack()) {
        BackHandler.exitApp();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [enabled]);
}
