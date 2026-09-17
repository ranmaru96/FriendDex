import { useEffect } from 'react';
import { usePathname, useUnstableGlobalHref } from 'expo-router';
import { getActiveTab } from '@/utils/bottomNavVisibility';
import { recordTabLocation, setTabStackPathname, shouldRememberTabRoute } from '@/utils/tabStacks';
import { clearNextReplaceAsPop } from '@/utils/tabTransition';

export function useTabStackSync() {
  const pathname = usePathname();
  const globalHref = useUnstableGlobalHref();
  const tab = getActiveTab(pathname);

  useEffect(() => {
    setTabStackPathname(pathname);
    if (shouldRememberTabRoute(pathname, tab)) {
      recordTabLocation(tab, globalHref);
    }
    clearNextReplaceAsPop();
  }, [globalHref, pathname, tab]);
}
