import { useEffect, useRef } from 'react';
import { usePathname, useUnstableGlobalHref } from 'expo-router';
import { getActiveTab } from '@/utils/bottomNavVisibility';
import {
  clearEpisodeDetailTabSwitch,
  consumeEpisodeDetailTabSwitch,
  isEpisodeDetailPath,
  setEpisodeDetailHostTab,
} from '@/utils/episodeDetailHost';
import { getTabStackPathname, recordTabLocation, setTabStackPathname, shouldRememberTabRoute } from '@/utils/tabStacks';
import { clearNextReplaceAsPop } from '@/utils/tabTransition';
import {
  finishNavigationReplayIfTarget,
  hydrateNavigationMemory,
  isNavigationReplayInProgress,
  isNavigationRestorePending,
  noteNavigation,
  touchCurrentHref,
} from '@/utils/navigationRestore';

export function useTabStackSync() {
  hydrateNavigationMemory();
  const pathname = usePathname();
  const globalHref = useUnstableGlobalHref();
  const previousPathRef = useRef(getTabStackPathname());
  const trailPrevRef = useRef<string | null>(null);

  if (previousPathRef.current !== pathname) {
    if (!isNavigationReplayInProgress()) {
      if (isEpisodeDetailPath(pathname)) {
        const switchedTab = consumeEpisodeDetailTabSwitch();
        if (switchedTab) {
          setEpisodeDetailHostTab(switchedTab);
        } else if (!isEpisodeDetailPath(previousPathRef.current)) {
          setEpisodeDetailHostTab(getActiveTab(previousPathRef.current) ?? 'episode');
        }
      } else {
        clearEpisodeDetailTabSwitch();
        setEpisodeDetailHostTab(null);
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
      noteNavigation(prev, globalHref);
    } else {
      touchCurrentHref(globalHref);
    }
    clearNextReplaceAsPop();
  }, [globalHref, pathname, tab]);
}
