import { getEpisodeDetailHostTab, isEpisodeDetailPath } from '@/utils/episodeDetailHost';
import { isCalendarTabRoot, isPeopleTabRoot } from '@/utils/tabRoots';

export const BOTTOM_NAV_SCROLL_CLEARANCE = 100;

export type BottomNavTabKey = 'home' | 'calendar' | 'episode' | 'tools' | 'tasks';

const HIDE_HEADER_PATHS = [
  'detail',
  'edit',
  'episode-detail',
  '/event',
  'myprofile',
  'myprofile-qr',
  'scan',
  'qr-import',
  'shuffle',
  'settlement',
  'settlement-room',
  'relationship-map',
  'your-answer',
  'wishlist',
  'mypage',
  'task-edit',
  'task-detail',
  'task-group',
  'appsettings',
  'commonitems',
  'setup-myself',
  'login',
  'auth-preview',
  'launch-preview',
];

const HIDE_BOTTOM_NAV_PATHS = [
  'edit',
  '/event',
  'myprofile',
  'myprofile-qr',
  'scan',
  'qr-import',
  'mypage',
  'task-edit',
  'commonitems',
  'setup-myself',
  'login',
  'auth-preview',
  'launch-preview',
];

export function shouldHideHeader(pathname: string): boolean {
  return HIDE_HEADER_PATHS.some((segment) => pathname.includes(segment));
}

export function shouldHideBottomNav(pathname: string): boolean {
  if (pathname.includes('event-detail')) {
    return false;
  }
  return HIDE_BOTTOM_NAV_PATHS.some((segment) => pathname.includes(segment));
}

/** シェルのヘッダー枠を残す。外すと遷移中に中身が上下へ跳ねる */
export function shouldKeepSharedHeaderFrame(pathname: string): boolean {
  if (pathname.includes('mypage')) {
    return true;
  }
  /** タスク詳細・グループは画面内のヘッダーを使う */
  if (pathname.includes('task-detail') || pathname.includes('task-group')) {
    return false;
  }
  return shouldHideHeader(pathname) && !shouldHideBottomNav(pathname);
}

export function getBottomNavScrollClearance(pathname: string): number {
  return shouldHideBottomNav(pathname) ? 0 : BOTTOM_NAV_SCROLL_CLEARANCE;
}

const UNTABBED_PATH_PARTS = ['setup-myself', 'login', 'auth-preview', 'launch-preview'];

function isUntabbedPath(pathname: string): boolean {
  return UNTABBED_PATH_PARTS.some((part) => pathname.includes(part));
}

/** URL だけから見た所属タブ。今開いているタブとは別。 */
export function getNaturalTab(pathname: string): BottomNavTabKey | null {
  if (pathname.includes('/appsettings') || isUntabbedPath(pathname)) return null;
  if (isEpisodeDetailPath(pathname)) return 'episode';
  if (isCalendarTabRoot(pathname) || pathname.includes('/event')) return 'calendar';
  if (
    pathname.includes('/shuffle') ||
    pathname.includes('/settlement') ||
    pathname.includes('/settlement-room') ||
    pathname.includes('/relationship-map') ||
    pathname.includes('/your-answer') ||
    pathname.includes('/wishlist')
  ) {
    return 'tools';
  }
  if (pathname.includes('/episode')) return 'episode';
  if (pathname.includes('/tools')) return 'tools';
  if (
    pathname.includes('/tasks') ||
    pathname.includes('/task-edit') ||
    pathname.includes('/task-detail') ||
    pathname.includes('/task-group')
  ) {
    return 'tasks';
  }
  if (isPeopleTabRoot(pathname) || pathname.includes('/detail')) return 'home';
  return 'home';
}

export function getActiveTab(pathname: string): BottomNavTabKey | null {
  /** 設定・ログインは、どのタブの上でもない */
  if (pathname.includes('/appsettings') || isUntabbedPath(pathname)) return null;
  const host = getEpisodeDetailHostTab();
  if (host) return host;
  return getNaturalTab(pathname);
}
