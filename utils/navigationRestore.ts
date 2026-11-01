import { router } from 'expo-router';
import { calendarHref, isCalendarTabRoot } from '@/utils/tabRoots';
import { hrefPathname } from '@/utils/tabStacks';

let gateResolved = false;
let notificationNavigationClaimed = false;
let notificationTargetPath: string | null = null;

/** 起動時のカレンダートップより、通知で開いた画面を優先する。 */
export function claimNotificationNavigation(targetPathname?: string): void {
  notificationNavigationClaimed = true;
  if (targetPathname) {
    notificationTargetPath = targetPathname;
  }
}

/** 次の path 変化が通知の行き先なら true。通知の行き先でなければ host は変えない。 */
export function takeNotificationHostReset(pathname: string): boolean {
  if (!notificationTargetPath) {
    return false;
  }
  const target = notificationTargetPath;
  notificationTargetPath = null;
  if (isCalendarTabRoot(target)) {
    return isCalendarTabRoot(pathname);
  }
  return hrefPathname(pathname) === hrefPathname(target);
}

/** ログアウトでログインへ戻したあと、次のログインでもう一度通す。 */
export function resetAuthGateNavigation(): void {
  gateResolved = false;
}

/**
 * 起動後はカレンダーのトップ。
 * 前回開いていた画面は覚えない。通知で開いた画面があるときは、そちらを優先する。
 */
export function openAfterAuthGate(pathname: string): void {
  if (gateResolved) {
    return;
  }
  gateResolved = true;
  if (notificationNavigationClaimed) {
    return;
  }
  const atCalendar = pathname === '/' || pathname === '/index' || pathname === '/calendar';
  if (!atCalendar) {
    router.replace(calendarHref());
  }
}
