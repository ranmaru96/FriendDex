import { useEffect, useRef } from 'react';
import { usePathname, useUnstableGlobalHref } from 'expo-router';
import { getActiveTab, getNaturalTab } from '@/utils/bottomNavVisibility';
import { consumeEpisodeDetailTabSwitch, setEpisodeDetailHostTab } from '@/utils/episodeDetailHost';
import { getTabStackPathname, recordTabLocation, setTabStackPathname, shouldRememberTabRoute } from '@/utils/tabStacks';
import { clearNextReplaceAsPop } from '@/utils/tabTransition';
import { takeNotificationHostReset } from '@/utils/navigationRestore';

export function useTabStackSync() {
  const pathname = usePathname();
  const globalHref = useUnstableGlobalHref();
  const previousPathRef = useRef(getTabStackPathname());

  if (previousPathRef.current !== pathname) {
    const previousPath = previousPathRef.current;
    const prevTab = getActiveTab(previousPath);
    const switchedTab = consumeEpisodeDetailTabSwitch();
    const notificationReset = takeNotificationHostReset(pathname);
    const cameFromUntabbed =
      previousPath.includes('login') ||
      previousPath.includes('reset-password') ||
      previousPath.includes('setup-myself') ||
      previousPath.includes('auth-preview') ||
      previousPath.includes('launch-preview');
    if (switchedTab) {
      setEpisodeDetailHostTab(switchedTab);
    } else if (notificationReset) {
      setEpisodeDetailHostTab(null);
    } else if (prevTab) {
      setEpisodeDetailHostTab(prevTab);
    } else if (cameFromUntabbed) {
      setEpisodeDetailHostTab(getNaturalTab(pathname));
    }
    previousPathRef.current = pathname;
  }

  const tab = getActiveTab(pathname);

  useEffect(() => {
    setTabStackPathname(pathname);
    if (shouldRememberTabRoute(pathname, tab)) {
      recordTabLocation(tab, globalHref);
    }
    clearNextReplaceAsPop();
  }, [globalHref, pathname, tab]);
}
