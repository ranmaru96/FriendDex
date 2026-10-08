import { router, type Href } from 'expo-router';
import { getAppSetting, initializeDatabase, setAppSetting } from '@/db';
import { getActiveTab, shouldHideBottomNav, type BottomNavTabKey } from '@/utils/bottomNavVisibility';
import { getEpisodeDetailHostTab, setEpisodeDetailHostTab } from '@/utils/episodeDetailHost';
import { calendarHref } from '@/utils/tabRoots';
import {
  hrefPathname,
  normalizeTabHref,
  restoreTabStacks,
  snapshotTabStacks,
} from '@/utils/tabStacks';

const STORAGE_KEY = 'navigation_restore';
const TRAIL_LIMIT = 8;

type HostTab = BottomNavTabKey;

type SavedNavigation = {
  stacks: Partial<Record<BottomNavTabKey, string[]>>;
  trail: string[];
  hostTab: HostTab | null;
};

let hydrated = false;
let restorePending = false;
let replayInProgress = false;
let replayTargetPath = '';
let replayNotice = false;
let replaySettled = false;
let gateResolved = false;
let notificationNavigationClaimed = false;
let trail: string[] = ['/'];

/** 起動時の画面復元より、通知で開いた画面を優先する。 */
export function claimNotificationNavigation(): void {
  notificationNavigationClaimed = true;
}

const toHref = (href: string): Href => {
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
};

const isHostTab = (value: unknown): value is HostTab =>
  value === 'home' ||
  value === 'calendar' ||
  value === 'episode' ||
  value === 'tools' ||
  value === 'tasks';

/** 保存前の入力が消える画面。起動時は開かず、一つ前へ戻す。 */
export function isUnsavedInputPath(pathname: string): boolean {
  if (pathname.includes('task-edit')) {
    return true;
  }
  if (pathname.includes('/edit')) {
    return true;
  }
  return pathname.includes('/event') && !pathname.includes('event-detail');
}

const usesRouterBack = (pathname: string): boolean =>
  shouldHideBottomNav(pathname) || pathname.includes('appsettings');

const isSkippablePath = (pathname: string): boolean =>
  pathname.includes('login') ||
  pathname.includes('setup-myself') ||
  pathname.includes('auth-preview') ||
  pathname.includes('launch-preview');

const sanitizeHref = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const href = normalizeTabHref(value);
  const path = hrefPathname(href);
  if (!path.startsWith('/') || isSkippablePath(path) || href.length > 500) {
    return null;
  }
  return href;
};

const readSaved = (): SavedNavigation | null => {
  const raw = getAppSetting(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<SavedNavigation>;
    const trailHrefs = Array.isArray(parsed.trail)
      ? parsed.trail.map(sanitizeHref).filter((href): href is string => href != null)
      : [];
    return {
      stacks: parsed.stacks && typeof parsed.stacks === 'object' ? parsed.stacks : {},
      trail: trailHrefs.length > 0 ? trailHrefs.slice(-TRAIL_LIMIT) : ['/'],
      hostTab: isHostTab(parsed.hostTab) ? parsed.hostTab : null,
    };
  } catch {
    return null;
  }
};

const stripUnsavedInputsFromStacks = (): void => {
  const current = snapshotTabStacks();
  const next: Partial<Record<BottomNavTabKey, string[]>> = {};
  (Object.keys(current) as BottomNavTabKey[]).forEach((tab) => {
    const hrefs = [...current[tab]];
    while (hrefs.length > 1 && isUnsavedInputPath(hrefPathname(hrefs[hrefs.length - 1] ?? ''))) {
      hrefs.pop();
    }
    next[tab] = hrefs;
  });
  restoreTabStacks(next);
};

const persist = (): void => {
  try {
    initializeDatabase();
    const payload: SavedNavigation = {
      stacks: snapshotTabStacks(),
      trail: trail.slice(-TRAIL_LIMIT),
      hostTab: getEpisodeDetailHostTab(),
    };
    setAppSetting(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // 画面遷移そのものは止めない
  }
};

const stripUnsavedInputs = (hrefs: string[]): { hrefs: string[]; droppedInput: boolean } => {
  const next = [...hrefs];
  let droppedInput = false;
  while (next.length > 1 && isUnsavedInputPath(hrefPathname(next[next.length - 1] ?? ''))) {
    next.pop();
    droppedInput = true;
  }
  if (next.length === 1 && isUnsavedInputPath(hrefPathname(next[0] ?? ''))) {
    return { hrefs: ['/'], droppedInput: true };
  }
  return { hrefs: next.length > 0 ? next : ['/'], droppedInput };
};

const nativeReplayHrefs = (hrefs: string[]): string[] => {
  if (hrefs.length === 0) {
    return ['/'];
  }
  let start = hrefs.length - 1;
  while (start > 0 && usesRouterBack(hrefPathname(hrefs[start] ?? ''))) {
    start -= 1;
  }
  return hrefs.slice(start);
};

const needsReplay = (hrefs: string[]): boolean => {
  const replay = nativeReplayHrefs(hrefs);
  if (replay.length > 1) {
    return true;
  }
  const only = replay[0] ?? '/';
  return hrefPathname(only) !== '/' || only.includes('?');
};

export function isNavigationRestorePending(): boolean {
  return restorePending;
}

export function isNavigationReplayInProgress(): boolean {
  return replayInProgress;
}

export function hydrateNavigationMemory(): void {
  if (hydrated) {
    return;
  }
  hydrated = true;
  try {
    initializeDatabase();
    const saved = readSaved();
    if (!saved) {
      return;
    }
    restoreTabStacks(saved.stacks);
    stripUnsavedInputsFromStacks();
    const stripped = stripUnsavedInputs(saved.trail);
    trail = stripped.hrefs;
    replayNotice = stripped.droppedInput;
    if (saved.hostTab) {
      setEpisodeDetailHostTab(saved.hostTab);
    }
    restorePending = needsReplay(trail) || replayNotice;
    if (stripped.droppedInput) {
      persist();
    }
  } catch {
    restorePending = false;
    replayNotice = false;
  }
}

export function noteNavigation(prevPath: string, nextHref: string): void {
  if (restorePending || replayInProgress) {
    return;
  }
  const normalized = normalizeTabHref(nextHref);
  const nextPath = hrefPathname(normalized);
  if (isSkippablePath(nextPath)) {
    return;
  }
  const prevTab = getActiveTab(prevPath);
  const nextTab = getActiveTab(nextPath);
  const switchedTab = nextTab != null && nextTab !== prevTab && !usesRouterBack(nextPath);
  if (switchedTab) {
    trail = [normalized];
  } else {
    const existing = trail.findIndex((item) => hrefPathname(item) === nextPath);
    if (existing >= 0) {
      trail = [...trail.slice(0, existing), normalized];
    } else {
      trail = [...trail, normalized].slice(-TRAIL_LIMIT);
    }
  }
  persist();
}

export function touchCurrentHref(nextHref: string): void {
  if (restorePending || replayInProgress) {
    return;
  }
  const normalized = normalizeTabHref(nextHref);
  const nextPath = hrefPathname(normalized);
  if (isSkippablePath(nextPath)) {
    return;
  }
  const last = trail[trail.length - 1];
  if (last && hrefPathname(last) === nextPath) {
    if (last === normalized) {
      return;
    }
    trail = [...trail.slice(0, -1), normalized];
  } else if (trail.length === 0) {
    trail = [normalized];
  }
  persist();
}

const finishReplay = (): void => {
  if (replaySettled) {
    return;
  }
  replaySettled = true;
  replayInProgress = false;
  restorePending = false;
  if (!replayNotice) {
    return;
  }
  replayNotice = false;
};

export function finishNavigationReplayIfTarget(pathname: string): void {
  if (!replayInProgress || hrefPathname(pathname) !== replayTargetPath) {
    return;
  }
  finishReplay();
}

const beginReplay = (hrefs: string[]): void => {
  const replay = nativeReplayHrefs(hrefs);
  replayTargetPath = hrefPathname(replay[replay.length - 1] ?? '/');
  replayInProgress = true;
  replaySettled = false;
  const [first, ...rest] = replay;
  router.replace(toHref(first ?? '/'));
  rest.forEach((href, index) => {
    setTimeout(() => {
      router.push(toHref(href));
    }, 40 * (index + 1));
  });
  setTimeout(() => {
    finishReplay();
  }, 40 * rest.length + 300);
};

const replayNavigationRestore = (): boolean => {
  if (!restorePending && !replayNotice) {
    return false;
  }
  const stripped = stripUnsavedInputs(trail);
  trail = stripped.hrefs;
  stripUnsavedInputsFromStacks();
  replayNotice = replayNotice || stripped.droppedInput;
  if (!needsReplay(trail) && !replayNotice) {
    restorePending = false;
    return false;
  }
  if (!needsReplay(trail)) {
    restorePending = false;
    finishReplay();
    return true;
  }
  persist();
  beginReplay(trail);
  return true;
};

/** ログアウトでログインへ戻したあと、次のログインでもう一度通す。 */
export function resetAuthGateNavigation(): void {
  gateResolved = false;
}

/**
 * 準備が済んだ起動で、保存した画面へ戻す。
 * 戻り先がなければ、ログインや初期設定にいるときだけカレンダーを開く。
 */
export function openAfterAuthGate(pathname: string): void {
  if (gateResolved) {
    return;
  }
  gateResolved = true;
  if (notificationNavigationClaimed) {
    restorePending = false;
    replayNotice = false;
    return;
  }
  if (replayNavigationRestore()) {
    return;
  }
  const atCalendar = pathname === '/' || pathname === '/index' || pathname === '/calendar';
  if (!atCalendar) {
    router.replace(calendarHref());
  }
}
