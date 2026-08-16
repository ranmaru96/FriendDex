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
  'follows',
  'friends',
  'task-edit',
  'task-detail',
  'task-group',
  'appsettings',
  'commonitems',
];

const HIDE_BOTTOM_NAV_PATHS = [
  'edit',
  '/event',
  'myprofile',
  'myprofile-qr',
  'scan',
  'qr-import',
  'follows',
  'friends',
  'task-edit',
  'task-detail',
  'task-group',
  'commonitems',
];

export function shouldHideHeader(pathname: string): boolean {
  return HIDE_HEADER_PATHS.some((segment) => pathname.includes(segment));
}

export function shouldHideBottomNav(pathname: string): boolean {
  return HIDE_BOTTOM_NAV_PATHS.some((segment) => pathname.includes(segment));
}

export function getBottomNavScrollClearance(pathname: string): number {
  return shouldHideBottomNav(pathname) ? 0 : BOTTOM_NAV_SCROLL_CLEARANCE;
}

export function getActiveTab(pathname: string): BottomNavTabKey | null {
  /** 設定などは下部タブを出すが、どのタブ上でもない（タップで各タブへ移れる） */
  if (pathname.includes('/appsettings')) return null;
  if (pathname.includes('/calendar')) return 'calendar';
  if (
    pathname.includes('/shuffle') ||
    pathname.includes('/settlement') ||
    pathname.includes('/settlement-room') ||
    pathname.includes('/relationship-map')
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
  if (pathname.includes('/detail')) return 'home';
  return 'home';
}
