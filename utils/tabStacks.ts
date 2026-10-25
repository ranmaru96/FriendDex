import { CALENDAR_ROOT, PEOPLE_ROOT, isCalendarTabRoot, isPeopleTabRoot } from '@/utils/tabRoots';
import {
  getActiveTab,
  shouldHideBottomNav,
  type BottomNavTabKey,
} from '@/utils/bottomNavVisibility';

export const TAB_ROOT_ROUTES: Record<BottomNavTabKey, '/' | '/people' | '/episode' | '/tools' | '/tasks'> =
  {
    home: PEOPLE_ROOT,
    calendar: CALENDAR_ROOT,
    episode: '/episode',
    tools: '/tools',
    tasks: '/tasks',
  };

const DROPPED_QUERY_KEYS = new Set(['edit', 'editEpisodeId', 'createForEventId']);

const stacks: Record<BottomNavTabKey, string[]> = {
  home: [TAB_ROOT_ROUTES.home],
  calendar: [TAB_ROOT_ROUTES.calendar],
  episode: [TAB_ROOT_ROUTES.episode],
  tools: [TAB_ROOT_ROUTES.tools],
  tasks: [TAB_ROOT_ROUTES.tasks],
};

let currentPathname = '/';

export function setTabStackPathname(pathname: string): void {
  currentPathname = pathname;
}

export function snapshotTabStacks(): Record<BottomNavTabKey, string[]> {
  return {
    home: [...stacks.home],
    calendar: [...stacks.calendar],
    episode: [...stacks.episode],
    tools: [...stacks.tools],
    tasks: [...stacks.tasks],
  };
}

export function restoreTabStacks(next: Partial<Record<BottomNavTabKey, string[]>>): void {
  (Object.keys(stacks) as BottomNavTabKey[]).forEach((tab) => {
    const incoming = next[tab];
    if (!incoming || incoming.length === 0) {
      return;
    }
    const hrefs = incoming.filter((href) => typeof href === 'string' && href.startsWith('/'));
    if (hrefs.length === 0) {
      return;
    }
    stacks[tab] = hrefs.slice(0, 8);
  });
}

export function getTabStackPathname(): string {
  return currentPathname;
}

export function hrefPathname(href: string): string {
  const q = href.indexOf('?');
  const path = q >= 0 ? href.slice(0, q) : href;
  if (path === '/index') {
    return '/';
  }
  return path || '/';
}

export function normalizeTabHref(globalHref: string): string {
  const raw = globalHref.trim() || '/';
  let pathWithSearch = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      pathWithSearch = `${url.pathname}${url.search}`;
    } catch {
      pathWithSearch = raw;
    }
  }
  if (!pathWithSearch.startsWith('/')) {
    pathWithSearch = `/${pathWithSearch}`;
  }

  let pathname = hrefPathname(pathWithSearch);
  if (pathname === '/index') {
    pathname = '/';
  }

  const q = pathWithSearch.indexOf('?');
  const search = q >= 0 ? pathWithSearch.slice(q + 1) : '';
  const params = new URLSearchParams(search);
  DROPPED_QUERY_KEYS.forEach((key) => {
    params.delete(key);
  });
  const kept = new URLSearchParams();
  Array.from(params.entries()).forEach(([key, value]) => {
    if (value.trim().length > 0) {
      kept.append(key, value);
    }
  });
  const qs = kept.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function isTabRootPath(pathname: string, tab: BottomNavTabKey): boolean {
  if (tab === 'calendar') {
    return isCalendarTabRoot(pathname);
  }
  if (tab === 'home') {
    return isPeopleTabRoot(pathname);
  }
  return pathname === TAB_ROOT_ROUTES[tab];
}

const isTabDrillInPath = (pathname: string): boolean =>
  pathname.includes('task-detail') ||
  pathname.includes('task-group') ||
  pathname.includes('task-edit') ||
  pathname.includes('/edit') ||
  (pathname.includes('/event') && !pathname.includes('event-detail'));

export function shouldRememberTabRoute(
  pathname: string,
  tab: BottomNavTabKey | null
): tab is BottomNavTabKey {
  if (!tab) {
    return false;
  }
  if (
    pathname.includes('setup-myself') ||
    pathname.includes('/appsettings') ||
    pathname.includes('login') ||
    pathname.includes('auth-preview') ||
    pathname.includes('launch-preview') ||
    pathname.includes('mypage') ||
    pathname.includes('/scan') ||
    pathname.includes('qr-import') ||
    pathname.includes('myprofile') ||
    pathname.includes('commonitems')
  ) {
    return false;
  }
  if (shouldHideBottomNav(pathname) && !isTabDrillInPath(pathname)) {
    return false;
  }
  return true;
}

export function recordTabLocation(tab: BottomNavTabKey, href: string): void {
  const normalized = normalizeTabHref(href);
  const path = hrefPathname(normalized);
  const root = TAB_ROOT_ROUTES[tab];

  if (isTabRootPath(path, tab)) {
    stacks[tab] = [root];
    return;
  }

  const stack = stacks[tab];
  const last = stack[stack.length - 1];
  const lastPath = hrefPathname(last);

  if (lastPath === path) {
    stack[stack.length - 1] = normalized;
    return;
  }

  const existingIndex = stack.findIndex((item) => hrefPathname(item) === path);
  if (existingIndex >= 0) {
    stacks[tab] = [...stack.slice(0, existingIndex), normalized];
    return;
  }

  stacks[tab] = [...stack, normalized];
}

export function getTabLeaf(tab: BottomNavTabKey): string {
  const stack = stacks[tab];
  return stack[stack.length - 1] ?? TAB_ROOT_ROUTES[tab];
}

export function resetTabStack(tab: BottomNavTabKey): void {
  stacks[tab] = [TAB_ROOT_ROUTES[tab]];
}

export function canPopCurrentTab(): boolean {
  const tab = getActiveTab(currentPathname);
  if (!tab) {
    return false;
  }
  return stacks[tab].length > 1;
}

/** ルートは残し、条件に合う詳細 URL を全部のタブの控えから外す。 */
export function forgetTabEntries(match: (href: string) => boolean): void {
  (Object.keys(stacks) as BottomNavTabKey[]).forEach((tab) => {
    const current = stacks[tab];
    const next = current.filter((href, index) => index === 0 || !match(href));
    if (next.length !== current.length) {
      stacks[tab] = next.length > 0 ? next : [TAB_ROOT_ROUTES[tab]];
    }
  });
}

export function popTabStack(tab: BottomNavTabKey): string {
  const stack = stacks[tab];
  if (stack.length <= 1) {
    stacks[tab] = [TAB_ROOT_ROUTES[tab]];
    return TAB_ROOT_ROUTES[tab];
  }
  const next = stack.slice(0, -1);
  stacks[tab] = next;
  return next[next.length - 1] ?? TAB_ROOT_ROUTES[tab];
}
