import { useSyncExternalStore } from 'react';
import { router, type ImperativeRouter } from 'expo-router';

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
  setLocked(false);
}

/** ボタンやタブなど、アプリが始めた画面移動のあいだタップを止める。 */
export function beginTapNavigationLock(): void {
  generation += 1;
  const current = generation;
  transitionSeenForGeneration = 0;
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

type LockingMethod = 'push' | 'replace' | 'navigate' | 'dismiss' | 'dismissTo' | 'dismissAll';

function wrapRouterMethod(name: LockingMethod): void {
  const original = router[name].bind(router) as ImperativeRouter[LockingMethod];
  const wrapped = ((...args: unknown[]) => {
    beginTapNavigationLock();
    return (original as (...passed: unknown[]) => void)(...args);
  }) as ImperativeRouter[LockingMethod];
  router[name] = wrapped;
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
