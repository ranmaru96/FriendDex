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
  'follows',
  'mypage',
  'friends',
  'task-edit',
  'task-detail',
  'task-group',
  'appsettings',
  'commonitems',
  'setup-myself',
  'login',
  'auth-preview',
];

const HIDE_BOTTOM_NAV_PATHS = [
  'edit',
  '/event',
  'myprofile',
  'myprofile-qr',
  'scan',
  'qr-import',
  'follows',
  'mypage',
  'friends',
  'task-edit',
  'task-detail',
  'task-group',
  'commonitems',
  'setup-myself',
  'login',
  'auth-preview',
];

export function shouldHideHeader(pathname: string): boolean {
  return HIDE_HEADER_PATHS.some((segment) => pathname.includes(segment));
}

export function shouldHideBottomNav(pathname: string): boolean {
  return HIDE_BOTTOM_NAV_PATHS.some((segment) => pathname.includes(segment));
}

/** シェルのヘッダー枠を残す。外すと遷移中に中身が上下へ跳ねる */
export function shouldKeepSharedHeaderFrame(pathname: string): boolean {
  if (pathname.includes('mypage')) {
    return true;
  }
  return shouldHideHeader(pathname) && !shouldHideBottomNav(pathname);
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
  if (pathname.includes('/detail')) return 'home';
  return 'home';
}
