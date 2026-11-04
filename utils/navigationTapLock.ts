import { useSyncExternalStore } from 'react';
import { router, type ImperativeRouter } from 'expo-router';
import { store } from 'expo-router/build/global-state/store';

/**
 * iOS の画面スライドは 0.5 秒。終了通知が来ないときも、これでロックを外す。
 * 通常は終了通知の方が先に来る。
 */
const TAP_LOCK_FALLBACK_MS = 800;

const WRAP_MARK = '__frienddexTapLock';

type Listener = () => void;

const listeners = new Set<Listener>();

let locked = false;
let generation = 0;
let transitionSeenForGeneration = 0;
let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
/** 次の beginTapNavigationLock だけ、タブの transitionEnd で外してよい。 */
let pendingTabSwitchRelease = false;
/** タブの transitionEnd で外してよいロックの世代。0 は対象外。 */
let armedTabGeneration = 0;
/** その世代のタブ transitionStart を見たら、その世代番号を入れる。 */
let tabSwitchSeenGeneration = 0;
/** transitionStart が乗っていたタブの route key。別の遷移の End では外さない。 */
let tabSwitchTarget: string | undefined;

function emit(): void {
  listeners.forEach((listener) => listener());
}

function setLocked(next: boolean): void {
  if (locked === next) {
    return;
  }
  locked = next;
  emit();
}

function release(current: number): void {
  if (current !== generation) {
    return;
  }
  if (fallbackTimer != null) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
  transitionSeenForGeneration = 0;
  tabSwitchSeenGeneration = 0;
  tabSwitchTarget = undefined;
  armedTabGeneration = 0;
  setLocked(false);
}

/** 直後の beginTapNavigationLock 1回だけ、タブの transitionEnd で外す。 */
export function expectTabSwitchLockRelease(): void {
  pendingTabSwitchRelease = true;
}

/** ボタンやタブなど、アプリが始めた画面移動のあいだタップを止める。 */
export function beginTapNavigationLock(): void {
  generation += 1;
  const current = generation;
  transitionSeenForGeneration = 0;
  tabSwitchSeenGeneration = 0;
  tabSwitchTarget = undefined;
  if (pendingTabSwitchRelease) {
    armedTabGeneration = current;
    pendingTabSwitchRelease = false;
  } else {
    armedTabGeneration = 0;
  }
  if (fallbackTimer != null) {
    clearTimeout(fallbackTimer);
  }
  fallbackTimer = setTimeout(() => {
    release(current);
  }, TAP_LOCK_FALLBACK_MS);
  setLocked(true);
}

/** スワイプ戻りは router を通らないので、ここには来ない。 */
export function noteTapNavigationTransitionStart(): void {
  if (!locked) {
    return;
  }
  transitionSeenForGeneration = generation;
}

/** 入ってくる画面の表示完了だけを終了にする。消える側の通知は移動の途中でも来ることがある。 */
export function noteTapNavigationTransitionEnd(closing: boolean): void {
  if (closing || !locked) {
    return;
  }
  if (transitionSeenForGeneration !== generation) {
    return;
  }
  release(generation);
}

/** タブの transitionStart。印がある世代だけ覚える。 */
export function noteTabSwitchTransitionStart(target: string | undefined): void {
  if (!locked || target == null || armedTabGeneration !== generation) {
    return;
  }
  tabSwitchSeenGeneration = generation;
  tabSwitchTarget = target;
}

/**
 * タブの transitionEnd。
 * 印がある世代で、その世代の Start と同じ route key のときだけ外す。
 */
export function noteTabSwitchTransitionEnd(target: string | undefined): void {
  if (
    !locked ||
    target == null ||
    tabSwitchSeenGeneration !== generation ||
    armedTabGeneration !== generation ||
    target !== tabSwitchTarget
  ) {
    return;
  }
  release(generation);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return locked;
}

export function useNavigationTapLock(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** 親 Stack と各タブの Stack で、タップロックを遷移の完了に合わせる。 */
export const navigationTapLockListeners = {
  transitionStart: () => {
    noteTapNavigationTransitionStart();
  },
  transitionEnd: (event: { data?: { closing?: boolean } }) => {
    noteTapNavigationTransitionEnd(event.data?.closing === true);
  },
};

type LockingMethod = 'push' | 'replace' | 'navigate' | 'dismiss' | 'dismissTo' | 'dismissAll';

/** スタックに画面を足すメソッド。ロック中、または最上段と同じなら呼ばない。 */
const STACKING_METHODS = new Set<LockingMethod>(['push', 'navigate']);

type NavState = {
  index?: number;
  routes?: NavRoute[];
};

type NavRoute = {
  name: string;
  params?: Record<string, unknown>;
  state?: NavState;
};

type RouteIdentity = {
  pathname: string;
  params: string;
};

function normalizePath(path: string): string {
  const q = path.indexOf('?');
  let pathname = q >= 0 ? path.slice(0, q) : path;
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  if (pathname === '/index') {
    return '/';
  }
  return pathname || '/';
}

function paramText(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.length > 0 ? value : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => paramText(item))
      .filter((item): item is string => item != null);
    return parts.length > 0 ? parts.join(',') : null;
  }
  return null;
}

function canonicalParams(params: Record<string, unknown> | undefined): string {
  if (!params) {
    return '';
  }
  const entries: [string, string][] = [];
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith('__') || key === 'screen' || key === 'params') {
      continue;
    }
    const text = paramText(value);
    if (text == null) {
      continue;
    }
    entries.push([key, text]);
  }
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return entries.map(([key, value]) => `${key}=${value}`).join('&');
}

function hrefIdentity(href: unknown): RouteIdentity | null {
  if (typeof href === 'string') {
    const q = href.indexOf('?');
    const pathname = normalizePath(href);
    const params: Record<string, unknown> = {};
    if (q >= 0) {
      for (const [key, value] of new URLSearchParams(href.slice(q + 1)).entries()) {
        params[key] = value;
      }
    }
    return { pathname, params: canonicalParams(params) };
  }
  if (!href || typeof href !== 'object' || !('pathname' in href)) {
    return null;
  }
  const pathnameValue = (href as { pathname?: unknown }).pathname;
  if (typeof pathnameValue !== 'string' || !pathnameValue.startsWith('/')) {
    return null;
  }
  const paramsValue = (href as { params?: unknown }).params;
  const params =
    paramsValue && typeof paramsValue === 'object'
      ? (paramsValue as Record<string, unknown>)
      : undefined;
  return { pathname: normalizePath(pathnameValue), params: canonicalParams(params) };
}

/** 見えている一番深い画面のパラメータ。親ルートのクエリは混ぜない。 */
function focusedLeafParams(): Record<string, unknown> | null {
  const root = store.navigationRef.current?.getRootState() as NavState | undefined;
  if (!root?.routes?.length) {
    return null;
  }
  let state: NavState | undefined = root;
  let route: NavRoute | undefined;
  while (state?.routes?.length) {
    route = state.routes[state.index ?? 0];
    if (!route?.state?.routes?.length) {
      break;
    }
    state = route.state;
  }
  return route?.params ?? {};
}

/** 最上段が、今開こうとしている pathname とパラメータと同じなら true。 */
function isAlreadyFocused(href: unknown): boolean {
  const target = hrefIdentity(href);
  if (!target) {
    return false;
  }
  const currentPath = normalizePath(store.getRouteInfo().pathname);
  if (currentPath !== target.pathname) {
    return false;
  }
  const leaf = focusedLeafParams();
  if (leaf == null) {
    return false;
  }
  return canonicalParams(leaf) === target.params;
}

function wrapRouterMethod(name: LockingMethod): void {
  const methods = router as unknown as Record<LockingMethod, (...args: unknown[]) => void>;
  const original = methods[name].bind(router);
  const stacks = STACKING_METHODS.has(name);
  methods[name] = (...args: unknown[]) => {
    if (stacks && (locked || isAlreadyFocused(args[0]))) {
      return;
    }
    beginTapNavigationLock();
    original(...args);
  };
}

/** useRouter() も同じ router を返す。スワイプの pop はここを通らない。 */
export function installNavigationTapLock(): void {
  const marked = router as ImperativeRouter & { [WRAP_MARK]?: boolean };
  if (marked[WRAP_MARK]) {
    return;
  }
  marked[WRAP_MARK] = true;

  wrapRouterMethod('push');
  wrapRouterMethod('replace');
  wrapRouterMethod('navigate');
  wrapRouterMethod('dismiss');
  wrapRouterMethod('dismissTo');
  wrapRouterMethod('dismissAll');

  const originalBack = router.back.bind(router);
  const originalCanGoBack = router.canGoBack.bind(router);
  router.back = () => {
    if (!originalCanGoBack()) {
      return;
    }
    beginTapNavigationLock();
    originalBack();
  };
}
