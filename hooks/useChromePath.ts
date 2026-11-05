import { usePathname, useRootNavigationState } from 'expo-router';
import { useRef } from 'react';

/** タブの上に載せる入力。予定詳細（event-detail）は含めない */
const OVERLAY_FORM_ROUTE_NAMES = new Set(['event', 'event-episode', 'task-edit']);

export function isOverlayFormRoute(routeName: string): boolean {
  return OVERLAY_FORM_ROUTE_NAMES.has(routeName);
}

export function isOverlayFormPath(pathname: string): boolean {
  const path = pathname.split('?')[0].replace(/\/$/, '') || '/';
  return isOverlayFormRoute(path.startsWith('/') ? path.slice(1) : path);
}

/**
 * タブ上の入力を開いているあいだは、その下に残っている画面のパスを返す。
 * 左右のすき間から見える画面のヘッダーと下部ナビを動かさないため。
 */
export function useChromePath(): { pathname: string; chromePath: string; overlayFormOpen: boolean } {
  const pathname = usePathname();
  const rootState = useRootNavigationState();
  const overlayFormOpen = isOverlayFormPath(pathname);
  const overlayInStack = Boolean(
    rootState?.routes?.some((route) => isOverlayFormRoute(route.name))
  );
  const hostPathRef = useRef(pathname);
  if (!overlayInStack && !overlayFormOpen) {
    hostPathRef.current = pathname;
  }
  return {
    pathname,
    chromePath: overlayFormOpen ? hostPathRef.current : pathname,
    overlayFormOpen,
  };
}
