import { router, type Href } from 'expo-router';
import { expectTabSwitchLockRelease } from '@/utils/navigationTapLock';
import { getActiveTab, type BottomNavTabKey } from '@/utils/bottomNavVisibility';
import { markEpisodeDetailTabSwitch } from '@/utils/episodeDetailHost';
import { setNextReplaceAsPop } from '@/utils/tabTransition';
import { persistNavigationMemory } from '@/utils/navigationRestore';
import {
  TAB_ROOT_ROUTES,
  canPopCurrentTab,
  forgetTabEntries,
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

function isOnAnyTabRoot(pathname: string): boolean {
  return (Object.keys(TAB_ROOT_ROUTES) as BottomNavTabKey[]).some((tab) =>
    isTabRootPath(pathname, tab)
  );
}

export function switchBottomTab(to: BottomNavTabKey, currentPathname: string): void {
  if (isTabRootPath(currentPathname, to)) {
    return;
  }
  const from = getActiveTab(currentPathname);
  if (from !== to) {
    markEpisodeDetailTabSwitch(to);
  }
  resetTabStack(to);
  const root = TAB_ROOT_ROUTES[to];
  // すでに5画面のどれかの上にいるとき、dismissTo は POP_TO のままタブへ届く。
  // インストール済みの TabRouter は POP_TO を処理しないので、画面は切り替わらない。
  // replace は同じ TabRouter が JUMP_TO にするため、開いている画面を残してルートへ移る。
  // 詳細など親 Stack の画面が上にあるときは dismissTo で、その画面を外して元のタブのルートを出す。
  if (isOnAnyTabRoot(currentPathname)) {
    expectTabSwitchLockRelease();
    router.replace(root);
    return;
  }
  router.dismissTo(root);
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

/** 開いている画面以外で削除したとき。控えから外すだけで、今の画面は動かさない。 */
export function forgetDetailFromTabs(match: (href: string) => boolean): void {
  forgetTabEntries(match);
  persistNavigationMemory();
}

/** 今開いている詳細が消えていたとき。全部のタブから外し、今のタブの一つ前を開く。 */
export function leaveForgottenDetail(match: (href: string) => boolean): void {
  const pathname = getTabStackPathname();
  const tab = getActiveTab(pathname);
  forgetTabEntries(match);
  persistNavigationMemory();
  if (!tab) {
    if (router.canGoBack()) {
      router.back();
    }
    return;
  }
  setNextReplaceAsPop();
  router.replace(toHref(getTabLeaf(tab)));
}
