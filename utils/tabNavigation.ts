import { router, type Href } from 'expo-router';
import { getActiveTab, type BottomNavTabKey } from '@/utils/bottomNavVisibility';
import { setNextReplaceAsPop } from '@/utils/tabTransition';
import {
  TAB_ROOT_ROUTES,
  canPopCurrentTab,
  getTabLeaf,
  getTabStackPathname,
  isTabRootPath,
  popTabStack,
  resetTabStack,
} from '@/utils/tabStacks';

function toHref(href: string): Href {
  const normalized = href.trim() || '/';
  const q = normalized.indexOf('?');
  if (q < 0) {
    return normalized as Href;
  }
  const pathname = normalized.slice(0, q) || '/';
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(normalized.slice(q + 1)).entries()) {
    params[key] = value;
  }
  return { pathname, params } as Href;
}

export function switchBottomTab(to: BottomNavTabKey, currentPathname: string): void {
  if (isTabRootPath(currentPathname, to)) {
    return;
  }
  const from = getActiveTab(currentPathname);
  if (from === to) {
    resetTabStack(to);
    router.replace(TAB_ROOT_ROUTES[to]);
    return;
  }
  router.replace(toHref(getTabLeaf(to)));
}

export function popCurrentTabScreen(): void {
  const pathname = getTabStackPathname();
  const tab = getActiveTab(pathname);
  if (!tab) {
    if (router.canGoBack()) {
      router.back();
    }
    return;
  }
  if (!canPopCurrentTab()) {
    return;
  }
  const href = popTabStack(tab);
  setNextReplaceAsPop();
  router.replace(toHref(href));
}
