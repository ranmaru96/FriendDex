import { router, type Href } from 'expo-router';
import { store } from 'expo-router/build/global-state/store';
import { beginTapNavigationLock, expectTabSwitchLockRelease } from '@/utils/navigationTapLock';
import { getActiveTab, type BottomNavTabKey } from '@/utils/bottomNavVisibility';
import { markEpisodeDetailTabSwitch } from '@/utils/episodeDetailHost';
import { setNextReplaceAsPop } from '@/utils/tabTransition';
import {
  TAB_ROOT_ROUTES,
  forgetTabEntries,
  getTabLeaf,
  getTabStackPathname,
  isTabRootPath,
} from '@/utils/tabStacks';

/**
 * タブ画面のルート名。カレンダーだけ route group なので (calendar)。
 * router.navigate / router.dismissTo / router.back は、この版では次の理由で使えない。
 * - navigate は子の screen まで payload に入れ、TabRouter が params を更新したあと子 Stack がそこへ NAVIGATE する（useNavigationBuilder.js 415–433行）。別タブの Stack は残らない。
 * - dismissTo は POP_TO。TabRouter は POP_TO を処理しない（TabRouter.js 308–309行）。
 * - router.back は target 無しの GO_BACK。子ナビゲータへは渡さない（useOnAction.js 98–101行、navigationInChildEnabled は既定 false）。
 * そのため、対象の key を付けて dispatch する。
 */
const TAB_SCREEN_NAME: Record<BottomNavTabKey, string> = {
  home: 'people',
  calendar: '(calendar)',
  episode: 'episode',
  tools: 'tools',
  tasks: 'tasks',
};

type NavState = {
  type?: string;
  key: string;
  index?: number;
  routes: NavRoute[];
};

type NavRoute = {
  name: string;
  key: string;
  state?: NavState;
};

function readRootState(): NavState | null {
  const state = store.navigationRef.current?.getRootState() as NavState | undefined;
  if (!state || !Array.isArray(state.routes)) {
    return null;
  }
  return state;
}

function dispatch(action: { type: string; target?: string; payload?: Record<string, unknown> }): void {
  store.navigationRef.current?.dispatch(action);
}

/** Expo Router の一番外は __root。予定編集などの親 Stack はその中。 */
function appStack(root: NavState): NavState {
  const slot = root.routes.find((route) => route.name === '__root');
  if (slot?.state && Array.isArray(slot.state.routes)) {
    return slot.state;
  }
  return root;
}

function tabsRoute(stack: NavState): NavRoute | null {
  return stack.routes.find((route) => route.name === '(tabs)') ?? null;
}

function focusedRoute(state: NavState | undefined): NavRoute | null {
  if (!state || !state.routes.length) {
    return null;
  }
  return state.routes[state.index ?? 0] ?? null;
}

/** 親 Stack にタブより前の画面があれば外す。タブの中身は残す。 */
function dismissParentScreens(root: NavState): boolean {
  if (root.type !== 'stack') {
    return false;
  }
  const index = root.index ?? 0;
  const tabsIndex = root.routes.findIndex((route) => route.name === '(tabs)');
  if (tabsIndex < 0 || index <= tabsIndex) {
    return false;
  }
  dispatch({
    type: 'POP',
    target: root.key,
    payload: { count: index - tabsIndex },
  });
  return true;
}

function focusTab(tabs: NavState, screenName: string, params?: Record<string, unknown>): void {
  dispatch({
    type: 'NAVIGATE',
    target: tabs.key,
    payload: params ? { name: screenName, params } : { name: screenName },
  });
}

function popStackToRoot(stack: NavState): boolean {
  if ((stack.index ?? 0) <= 0) {
    return false;
  }
  dispatch({ type: 'POP_TO_TOP', target: stack.key });
  return true;
}

/** 一番深い、1枚以上積んでいる Stack。タブ自体は対象にしない。 */
function deepestPoppableStack(state: NavState | undefined): NavState | null {
  let found: NavState | null = null;
  let current = state;
  while (current) {
    if (current.type === 'stack' && (current.index ?? 0) > 0) {
      found = current;
    }
    const route = current.routes[current.index ?? 0];
    current = route?.state;
  }
  return found;
}

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
  const root = readRootState();
  const stack = root ? appStack(root) : null;
  const tabs = stack ? tabsRoute(stack)?.state : null;
  if (!stack || !tabs || tabs.type !== 'tab') {
    return;
  }
  const screenName = TAB_SCREEN_NAME[to];
  const focused = focusedRoute(tabs);
  const switchingTab = focused?.name !== screenName;
  const sameStack = !switchingTab && focused?.state?.type === 'stack' ? focused.state : null;
  const tabsIndex = stack.routes.findIndex((route) => route.name === '(tabs)');
  const parentOpen = stack.type === 'stack' && tabsIndex >= 0 && (stack.index ?? 0) > tabsIndex;
  const popSame = Boolean(sameStack && (sameStack.index ?? 0) > 0);
  console.log('[tabPress]', {
    focused: focused?.name ?? null,
    stateType: focused?.state?.type ?? null,
    stateIndex: focused?.state?.index ?? null,
    stateRoutes: focused?.state?.routes?.map((route) => route.name) ?? null,
    parentIndex: stack.index ?? null,
    parentRoutes: stack.routes.map((route) => route.name),
    parentOpen,
    switchingTab,
    popSame,
  });
  if (!parentOpen && !switchingTab && !popSame) {
    return;
  }
  markEpisodeDetailTabSwitch(to);
  if (switchingTab) {
    expectTabSwitchLockRelease();
  }
  beginTapNavigationLock();
  if (parentOpen) {
    dismissParentScreens(stack);
  }
  if (switchingTab) {
    focusTab(tabs, screenName);
  } else if (sameStack && popSame) {
    popStackToRoot(sameStack);
  }
}

/**
 * 見えている Stack を1枚戻す。
 * router.back() は親 Stack にしか届かないので、積んでいる一番深い Stack を対象にする。
 */
export function popCurrentTabScreen(): boolean {
  const root = readRootState();
  const stack = deepestPoppableStack(root ? appStack(root) : undefined);
  if (!stack) {
    return false;
  }
  beginTapNavigationLock();
  dispatch({ type: 'GO_BACK', target: stack.key });
  return true;
}

/** 予定編集を閉じて、エピソード一覧で作成欄を開く。 */
export function openEpisodeComposerForEvent(eventId: string): void {
  const id = eventId.trim();
  if (!id) {
    return;
  }
  const root = readRootState();
  const stack = root ? appStack(root) : null;
  const tabs = stack ? tabsRoute(stack)?.state : null;
  if (!stack || !tabs || tabs.type !== 'tab') {
    return;
  }
  markEpisodeDetailTabSwitch('episode');
  expectTabSwitchLockRelease();
  beginTapNavigationLock();
  dismissParentScreens(stack);
  focusTab(tabs, TAB_SCREEN_NAME.episode, {
    screen: 'index',
    params: { createForEventId: id },
    pop: true,
  });
}

/** 開いている画面以外で削除したとき。控えから外すだけで、今の画面は動かさない。 */
export function forgetDetailFromTabs(match: (href: string) => boolean): void {
  forgetTabEntries(match);
}

/** 今開いている詳細が消えていたとき。全部のタブから外し、今のタブの一つ前を開く。 */
export function leaveForgottenDetail(match: (href: string) => boolean): void {
  const pathname = getTabStackPathname();
  const tab = getActiveTab(pathname);
  forgetTabEntries(match);
  if (!popCurrentTabScreen()) {
    if (!tab) {
      if (router.canGoBack()) {
        router.back();
      }
      return;
    }
    setNextReplaceAsPop();
    router.replace(toHref(getTabLeaf(tab)));
  }
}
