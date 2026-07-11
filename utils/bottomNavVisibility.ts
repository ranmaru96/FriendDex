export const BOTTOM_NAV_SCROLL_CLEARANCE = 100;

export type BottomNavTabKey = 'home' | 'commonitems' | 'calendar' | 'episode' | 'tools' | 'friends';

const HIDE_HEADER_PATHS = [
  'detail',
  'edit',
  'episode-detail',
  '/event',
  'myprofile',
  'myprofile-qr',
  'scan',
  'qr-import',
  'money-loan',
  'shuffle',
];

const HIDE_BOTTOM_NAV_PATHS = ['edit', '/event', 'myprofile', 'myprofile-qr', 'scan', 'qr-import'];

export function shouldHideHeader(pathname: string): boolean {
  return HIDE_HEADER_PATHS.some((segment) => pathname.includes(segment));
}

export function shouldHideBottomNav(pathname: string): boolean {
  return HIDE_BOTTOM_NAV_PATHS.some((segment) => pathname.includes(segment));
}

export function getBottomNavScrollClearance(pathname: string): number {
  return shouldHideBottomNav(pathname) ? 0 : BOTTOM_NAV_SCROLL_CLEARANCE;
}

export function getActiveTab(pathname: string): BottomNavTabKey {
  if (pathname.includes('/commonitems')) return 'commonitems';
  if (pathname.includes('/calendar')) return 'calendar';
  if (pathname.includes('/friends')) return 'friends';
  if (pathname.includes('/money-loan') || pathname.includes('/shuffle')) return 'tools';
  if (pathname.includes('/episode')) return 'episode';
  if (pathname.includes('/tools')) return 'tools';
  if (pathname.includes('/detail')) return 'home';
  return 'home';
}
