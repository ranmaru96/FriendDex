import { useEffect, useRef } from 'react';
import { usePathname, useUnstableGlobalHref } from 'expo-router';
import { getActiveTab, getNaturalTab, type BottomNavTabKey } from '@/utils/bottomNavVisibility';
import { consumeEpisodeDetailTabSwitch, setEpisodeDetailHostTab } from '@/utils/episodeDetailHost';
import { getTabStackPathname, recordTabLocation, setTabStackPathname, shouldRememberTabRoute } from '@/utils/tabStacks';
import { clearNextReplaceAsPop } from '@/utils/tabTransition';
import {
  finishNavigationReplayIfTarget,
  hydrateNavigationMemory,
  isNavigationReplayInProgress,
  isNavigationRestorePending,
  noteNavigation,
  takeNotificationHostReset,
  touchCurrentHref,
} from '@/utils/navigationRestore';

export function useTabStackSync() {
  hydrateNavigationMemory();
  const pathname = usePathname();
  const globalHref = useUnstableGlobalHref();
  const previousPathRef = useRef(getTabStackPathname());
  const trailPrevRef = useRef<string | null>(null);
  const trailPrevTabRef = useRef<BottomNavTabKey | null>(null);

  if (previousPathRef.current !== pathname) {
    if (!isNavigationReplayInProgress()) {
      const previousPath = previousPathRef.current;
      const prevTab = getActiveTab(previousPath);
      trailPrevTabRef.current = prevTab;
      const switchedTab = consumeEpisodeDetailTabSwitch();
      const notificationReset = takeNotificationHostReset(pathname);
      const cameFromUntabbed =
        previousPath.includes('login') ||
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
    }
    previousPathRef.current = pathname;
  }

  const tab = getActiveTab(pathname);

  useEffect(() => {
    const prev = trailPrevRef.current;
    trailPrevRef.current = pathname;
    if (isNavigationReplayInProgress()) {
      finishNavigationReplayIfTarget(pathname);
      return;
    }
    if (isNavigationRestorePending()) {
      return;
    }
    setTabStackPathname(pathname);
    if (shouldRememberTabRoute(pathname, tab)) {
      recordTabLocation(tab, globalHref);
    }
    if (prev != null && prev !== pathname) {
      noteNavigation(prev, globalHref, trailPrevTabRef.current);
    } else {
      touchCurrentHref(globalHref);
    }
    clearNextReplaceAsPop();
  }, [globalHref, pathname, tab]);
}
